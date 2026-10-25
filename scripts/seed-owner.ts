import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

/**
 * Creates (or refreshes) an Owner account.
 *
 *   OWNER_EMAIL=… OWNER_PASSWORD=… npm run db:seed:owner
 *
 * The credentials come from the environment on purpose: they must never be committed. Safe to re-run;
 * it rotates the password of an existing Owner and refuses to touch an account that holds another role.
 */
async function main() {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD;
  if (!email || !password) throw new Error("Set OWNER_EMAIL and OWNER_PASSWORD.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("OWNER_EMAIL is not a valid email address.");
  if (password.length < 8 || password.length > 72) throw new Error("OWNER_PASSWORD must be 8–72 characters.");

  const { eq } = await import("drizzle-orm");
  const { hash } = await import("bcryptjs");
  const { db } = await import("@/lib/db");
  const { users } = await import("@/lib/db/schema");

  const passwordHash = await hash(password, 10);
  const [existing] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, email));

  if (existing) {
    if (existing.role !== "owner") throw new Error(`${email} already exists with role "${existing.role}"; refusing to change it.`);
    await db.update(users).set({ passwordHash, active: true }).where(eq(users.id, existing.id));
    console.log(`Owner ${email} refreshed (password rotated, account active).`);
  } else {
    await db.insert(users).values({ name: "Owner", email, passwordHash, role: "owner", title: "Owner", active: true });
    console.log(`Owner ${email} created.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "Owner seed failed");
    process.exit(1);
  });
