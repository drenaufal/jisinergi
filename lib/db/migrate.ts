import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { createPool } from "./pool";

async function main() {
  const pool = createPool(process.env.DATABASE_URL!);
  const db = drizzle(pool);
  console.log("→ Running migrations against MariaDB…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("✓ Migrations applied.");
}

main().catch((err) => {
  console.error("✗ Migration failed:", err);
  process.exit(1);
});
