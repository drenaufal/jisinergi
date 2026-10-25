import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

/**
 * One-command local database setup:
 *
 *   npm run db:setup-local
 *
 * Reads DATABASE_URL from .env.local, asks for the local MariaDB *root* password (typed in your
 * terminal, never stored), creates the database and the app user from that URL, checks that the app
 * user can really log in, then runs the migration and seeds the first administrator.
 * Re-running is safe: it resets the app user's password to the one in .env.local.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

function findClient() {
  const roots = ["C:/Program Files", "C:/Program Files (x86)"];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const dir of fs.readdirSync(root).filter((d) => /^MariaDB|^MySQL/i.test(d)).sort().reverse()) {
      for (const exe of ["mariadb.exe", "mysql.exe"]) {
        const p = path.join(root, dir, "bin", exe);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return process.env.MARIADB_CLIENT || "mariadb";
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) fail("This step needs an interactive terminal. Run `npm run db:setup-local` yourself, or set MARIADB_ROOT_PASSWORD.");
    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    let value = "";
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(value);
        }
        if (c === "\u0003") process.exit(130); // Ctrl+C
        if (c === "\u007f" || c === "\b") value = value.slice(0, -1);
        else value += c;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const client = findClient();
  const run = (user: string, password: string, sql: string, database?: string) =>
    spawnSync(client, ["-u", user, "-h", "127.0.0.1", "--protocol=tcp", "-P", port, ...(database ? [database] : []), "-e", sql], {
      env: { ...process.env, MYSQL_PWD: password },
      encoding: "utf8",
    });
  const clean = (s: string, ...secrets: string[]) =>
    secrets.reduce((t, x) => (x ? t.split(x).join("***") : t), s).replace(/^WARNING:.*\n/gm, "").trim();

  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL is missing. Add it to .env.local (see .env.example).");
  const target = new URL(url!);
  const host = target.hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) fail(`DATABASE_URL points at ${host}, not this machine. This script only sets up a local database.`);
  const appUser = decodeURIComponent(target.username);
  const appPassword = decodeURIComponent(target.password);
  const database = target.pathname.slice(1);
  const port = target.port || "3306";
  if (!/^[A-Za-z0-9_]+$/.test(database) || !/^[A-Za-z0-9_]+$/.test(appUser)) fail("Database and user names may only contain letters, digits and underscores.");
  if (/['\\]/.test(appPassword)) fail("The database password in .env.local contains a quote or backslash; use letters and digits only.");

  console.log(`Client:   ${client}\nTarget:   ${database} on ${host}:${port} as ${appUser}\n`);

  const works = () => run(appUser, appPassword, "SELECT 1", database);
  let check = works();
  if (check.status === 0) {
    console.log("✓ The app user can already log in; skipping the root step.");
  } else {
    console.log("The app user cannot log in yet — creating it as root.");
    const rootPassword = process.env.MARIADB_ROOT_PASSWORD ?? (await askHidden("MariaDB root password (hidden, not saved): "));
    const probe = run("root", rootPassword, "SELECT CURRENT_USER()");
    if (probe.status !== 0) {
      fail(
        `Root login failed:\n${clean(probe.stderr, rootPassword)}\n\n` +
          "That password is not accepted by this MariaDB server. If you do not remember it, reset it with the official procedure\n" +
          "(stop the MariaDB service, start mysqld with --skip-grant-tables as Administrator, set a new root password)\n" +
          "or use HeidiSQL's saved session, then run this command again.",
      );
    }
    const sql = [
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      ...["localhost", "127.0.0.1", "::1"].flatMap((h) => [
        `CREATE USER IF NOT EXISTS '${appUser}'@'${h}' IDENTIFIED BY '${appPassword}'`,
        `ALTER USER '${appUser}'@'${h}' IDENTIFIED BY '${appPassword}'`,
        `GRANT ALL PRIVILEGES ON \`${database}\`.* TO '${appUser}'@'${h}'`,
      ]),
      "FLUSH PRIVILEGES",
    ].join(";\n");
    const created = run("root", rootPassword, sql);
    if (created.status !== 0) fail(`Could not create the database/user:\n${clean(created.stderr, rootPassword, appPassword)}`);
    console.log("✓ Database and app user created.");

    check = works();
    if (check.status !== 0) {
      // Show which accounts could capture the login (e.g. an anonymous user with a different auth plugin).
      const who = run("root", rootPassword, `SELECT user, host, plugin FROM mysql.user WHERE user IN ('${appUser}', '')`);
      fail(`The app user was created but still cannot log in:\n${clean(check.stderr, appPassword)}\n\nAccounts that match:\n${clean(who.stdout || who.stderr, rootPassword)}`);
    }
  }
  console.log("✓ App user login verified.\n");

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  for (const script of ["db:migrate", "db:seed:owner"]) {
    console.log(`$ npm run ${script}`);
    const r = spawnSync(npm, ["run", script], { stdio: "inherit", shell: process.platform === "win32" });
    if (r.status !== 0) fail(`npm run ${script} failed (see above).`);
  }
  console.log(`\n✓ Done. Start the app with: npm run dev   then open http://localhost:3000\n  Owner email and password are in .env.local (OWNER_EMAIL / OWNER_PASSWORD).`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
