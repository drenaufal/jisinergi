import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

/**
 * Loads demo data: one Liga unit (the original workbooks) and one Sekolah Bola unit (invented sample).
 *
 *   npm run db:seed:demo                       write the demo data (skips what is already there)
 *   npm run db:seed:demo -- --dry-run          show what would be written, change nothing
 *   npm run db:seed:demo -- --reset            replace the demo units' rows with the demo data
 *   DEMO_PASSWORD=… npm run db:seed:demo       also create one Admin Unit login per demo unit
 *   npm run db:seed:demo -- --remove           delete the demo units, their data and their logins (no undo)
 *
 * Safe to re-run. Only touches the two demo units (codes LIGA-DEMO and SB-DEMO) and their logins.
 * The target database is whatever DATABASE_URL points at; the host is printed first so a production
 * URL cannot slip by unnoticed. Requires `npm run db:migrate` first.
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.some((a) => !/^(--dry-run|--reset|--remove)$/.test(a))) throw new Error("Usage: npm run db:seed:demo -- [--dry-run] [--reset] [--remove]");
  const remove = args.includes("--remove") || process.env.npm_config_remove === "true";
  // npm's Windows launcher can swallow flags as npm configuration; honour that for --dry-run.
  const dryRun = args.includes("--dry-run") || process.env.npm_config_dry_run === "true";
  const reset = args.includes("--reset") || process.env.npm_config_reset === "true";

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const target = new URL(url);
  console.log(`Database: ${target.hostname}:${target.port || "3306"}${target.pathname}${dryRun ? "  (dry run)" : ""}`);

  const password = process.env.DEMO_PASSWORD;
  if (password && (password.length < 8 || password.length > 72)) throw new Error("DEMO_PASSWORD must be 8–72 characters.");

  const { db } = await import("@/lib/db");
  if (remove) {
    const { removeUnit } = await import("@/lib/finance/remove");
    const { DEMO_LIGA, DEMO_SCHOOL } = await import("@/lib/finance/seed");
    for (const code of [DEMO_LIGA.code, DEMO_SCHOOL.code]) {
      const r = await removeUnit(db, code, { dryRun });
      console.log(r.found ? `unit      ${code.padEnd(10)} ${dryRun ? "would remove" : "removed"}: ${Object.values(r.rows).reduce((a, b) => a + b, 0)} rows, ${r.logins} logins, ${r.receipts} receipts` : `unit      ${code.padEnd(10)} not found`);
    }
    console.log(dryRun ? "Dry run: nothing was removed." : "Done.");
    return;
  }
  const { seedDemo } = await import("@/lib/finance/seed");
  const report = await seedDemo(db, { dryRun, reset, accountPassword: password });

  for (const u of report.units) console.log(`unit      ${u.code.padEnd(10)} ${u.created ? "created" : "already there"}`);
  for (const t of report.tables) {
    const note = t.action === "skipped" ? `skipped — ${t.existing} rows already there` : `${t.action} ${t.rows} rows`;
    console.log(`table     ${t.table.padEnd(22)} ${t.unit.padEnd(10)} ${note}`);
  }
  for (const a of report.accounts) console.log(`login     ${a.email.padEnd(30)} ${a.unit.padEnd(10)} ${a.created ? "created" : "already there"}`);
  console.log(dryRun ? "Dry run: nothing was written." : "Done.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "Demo seed failed");
    process.exit(1);
  });
