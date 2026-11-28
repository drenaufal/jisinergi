import { config } from "dotenv";
config({ path: ".env.local" });

import readline from "node:readline";
import { createPool } from "../lib/db/pool";

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const val = answer.trim().toLowerCase();
      resolve(val === "y" || val === "yes");
    });
  });
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL tidak ditemukan di .env.local");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const isForce = args.includes("--force") || args.includes("-y");
  const specificTables = args.filter((a) => !a.startsWith("-"));

  const pool = createPool(databaseUrl);
  const conn = await pool.getConnection();

  try {
    const [dbRows] = await conn.query("SELECT DATABASE() AS current_db;");
    const currentDb = (dbRows as Record<string, unknown>[])[0]?.current_db ?? "unknown";

    const [tableRows] = await conn.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE';",
    );
    const existingTables = (tableRows as Record<string, unknown>[]).map(
      (r) => String(r.table_name ?? r.TABLE_NAME),
    );

    if (existingTables.length === 0) {
      console.log(`ℹ️  Tidak ada tabel di database "${currentDb}".`);
      return;
    }

    const tablesToDrop =
      specificTables.length > 0
        ? specificTables.filter((t) => existingTables.includes(t))
        : existingTables;

    if (specificTables.length > 0) {
      const notFound = specificTables.filter((t) => !existingTables.includes(t));
      if (notFound.length > 0) {
        console.warn(`⚠️  Tabel tidak ditemukan di database: ${notFound.join(", ")}`);
      }
      if (tablesToDrop.length === 0) {
        console.log("ℹ️  Tidak ada tabel yang cocok untuk dihapus.");
        return;
      }
    }

    console.log(`\nTarget Database: ${currentDb}`);
    console.log(`Tabel yang akan di-drop (${tablesToDrop.length}):`);
    tablesToDrop.forEach((t) => console.log(`  - ${t}`));

    if (!isForce && process.stdin.isTTY) {
      const ok = await confirm(
        `\n⚠️  PERINGATAN: Semua data pada tabel di atas akan DIHAPUS PERMANEN!\nLanjutkan drop ${tablesToDrop.length} tabel? (y/N): `,
      );
      if (!ok) {
        console.log("❌ Tindakan dibatalkan oleh pengguna.");
        return;
      }
    }

    console.log("\n→ Menonaktifkan foreign key checks...");
    await conn.query("SET FOREIGN_KEY_CHECKS = 0;");

    for (const table of tablesToDrop) {
      await conn.query(`DROP TABLE IF EXISTS \`${table}\`;`);
      console.log(`  ✓ Dropped table: ${table}`);
    }

    await conn.query("SET FOREIGN_KEY_CHECKS = 1;");
    console.log("→ Mengaktifkan kembali foreign key checks...");

    console.log(`\n✅ Selesai: Berhasil menghapus ${tablesToDrop.length} tabel dari database "${currentDb}".\n`);
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Terjadi kesalahan saat drop table:", err);
  process.exit(1);
});
