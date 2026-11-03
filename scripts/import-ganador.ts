import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readWorkbook } from "./lib/xlsx-reader";
import { parseGanador } from "./lib/excel-ganador";
import { norm } from "./lib/excel-types";

/**
 * Loads "LAPORAN KEUANGAN & DATABASE SSB GANADOR.xlsx" into the database as one Sekolah Bola unit:
 *
 *   LAPORAN KEUANGAN  Saldo Awal            → Modal (one row)
 *                     Cash In               → Pemasukan, as the student's payment (registration or monthly fee)
 *                     Cash Out              → Pengeluaran (with absen and gaji satuan for salaries)
 *   DATABASE          one row per student   → Siswa (NIK, birth place and date, parent's phone, jersey size)
 *
 *   npm run db:import:ganador -- --file "<xlsx>"
 *   npm run db:import:ganador -- --dry-run     read the file, check both sheets against each other, write nothing
 *   npm run db:import:ganador -- --reset       replace the unit with a fresh import
 *   npm run db:import:ganador -- --remove      delete the unit and everything under it (no undo)
 *
 * Without --file it looks in your Downloads folder (or GANADOR_XLSX). A unit that already exists is left alone unless
 * --reset is given. The target database is whatever DATABASE_URL points at. Nothing is written when the two sheets
 * disagree with each other or with a total the sheet states for itself.
 */

const UNIT = {
  code: "SB-GANADOR",
  name: "SSB Ganador",
  description: "Dari “LAPORAN KEUANGAN & DATABASE SSB GANADOR.xlsx”: laporan keuangan dan database siswa.",
};

const DOWNLOADS = join(homedir(), "Downloads");
const rupiah = (n: number) => n.toLocaleString("id-ID");

function arg(name: string) {
  const args = process.argv.slice(2);
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}
const flag = (name: string, npmKey: string) => process.argv.includes(name) || process.env[`npm_config_${npmKey}`] === "true";

async function main() {
  const args = process.argv.slice(2);
  const stray = args.filter((a, i) => a.startsWith("--") && !/^(--dry-run|--reset|--remove|--file)$/.test(a) && args[i - 1] !== "--file");
  if (stray.length) throw new Error('Usage: npm run db:import:ganador -- [--file "<xlsx>"] [--dry-run] [--reset] [--remove]');
  const dryRun = flag("--dry-run", "dry_run");
  const reset = flag("--reset", "reset");
  const remove = flag("--remove", "remove");

  const url = process.env.DATABASE_URL;
  if (!url && !dryRun) throw new Error("DATABASE_URL is not set.");
  if (url) {
    const target = new URL(url);
    console.log(`Database: ${target.hostname}:${target.port || "3306"}${target.pathname}${dryRun ? "  (dry run)" : ""}`);
  }

  if (remove) {
    const { db } = await import("@/lib/db");
    const { removeUnit } = await import("@/lib/finance/remove");
    const r = await removeUnit(db, UNIT.code, { dryRun });
    console.log(r.found ? `unit ${UNIT.code} ${dryRun ? "would remove" : "removed"}: ${Object.values(r.rows).reduce((a, b) => a + b, 0)} rows, ${r.receipts} receipts` : `unit ${UNIT.code} not found`);
    return;
  }

  const file = arg("--file") ?? process.env.GANADOR_XLSX ?? join(DOWNLOADS, "LAPORAN KEUANGAN & DATABASE SSB GANADOR.xlsx");
  if (!existsSync(file)) throw new Error(`File not found — ${file}\n  give it with --file "<path>"`);
  const wb = readWorkbook(file);
  const data = parseGanador(wb);

  console.log(`\n${UNIT.code} ← ${file}`);
  console.log(`  ${data.title}`);
  console.log(`  Saldo awal (→ Modal): Rp ${rupiah(data.openingBalance)}`);
  console.log(`  Siswa: ${data.students.length} · Pembayaran: ${data.payments.length} (${data.payments.filter((p) => p.kind === "registration").length} registrasi, ${data.payments.filter((p) => p.kind === "monthly").length} iuran bulanan) · Pengeluaran: ${data.expenses.length}`);
  const byCategory = new Map<string, number>();
  for (const e of data.expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  console.log(`  Kategori pengeluaran: ${[...byCategory].map(([c, a]) => `${c} Rp ${rupiah(a)}`).join(" · ")}`);
  let failed = false;
  for (const c of data.checks) {
    const same = c.expected === c.actual;
    if (!same) failed = true;
    console.log(`  ${same ? "✓" : "✗"} ${c.label}: ${rupiah(c.actual)}${same ? "" : `  (file: ${rupiah(c.expected)})`}`);
  }
  for (const w of data.warnings) console.log(`  ! ${w}`);
  if (failed) throw new Error("Nothing was written: fix the file or the importer first.");
  if (dryRun) {
    console.log("\nDry run: nothing was written.");
    return;
  }

  const { db } = await import("@/lib/db");
  const s = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const { removeUnit } = await import("@/lib/finance/remove");

  const [found] = await db.select({ id: s.businessUnits.id }).from(s.businessUnits).where(eq(s.businessUnits.code, UNIT.code));
  if (found && !reset) {
    console.log(`\nunit ${UNIT.code}: already there, skipped (use --reset to replace it)`);
    return;
  }
  if (found) await removeUnit(db, UNIT.code);

  const unitId = crypto.randomUUID();
  const studentIds = new Map(data.students.map((st) => [norm(st.name), crypto.randomUUID()]));
  const firstPayment = (name: string) => data.payments.filter((p) => norm(p.student) === norm(name)).map((p) => p.paidOn).sort()[0];
  // rows of one day keep the order of the sheet: each row is stamped a millisecond after the one above it
  const stamp = (() => {
    const base = Date.now() - 60_000;
    return (sheetRow: number) => new Date(base + sheetRow);
  })();
  const chunks = <T,>(rows: T[], n: number) => Array.from({ length: Math.ceil(rows.length / n) }, (_, i) => rows.slice(i * n, (i + 1) * n));

  await db.transaction(async (tx) => {
    await tx.insert(s.businessUnits).values({ id: unitId, code: UNIT.code, name: UNIT.name, type: "sekolah_bola", description: UNIT.description });

    await tx.insert(s.finStudents).values(
      data.students.map((st) => {
        const joinedOn = st.joinedOn ?? firstPayment(st.name);
        return {
          id: studentIds.get(norm(st.name))!,
          businessUnitId: unitId,
          name: st.name,
          nickname: st.nickname,
          nik: st.nik,
          birthPlace: st.birthPlace,
          birthDate: st.birthDate,
          parentPhone: st.parentPhone,
          jerseySize: st.jerseySize,
          sizeType: st.sizeType,
          joinedOn: joinedOn ?? new Date().toISOString().slice(0, 10),
          note: st.joinedOn ? null : "Tanggal bergabung tidak ada di Excel; memakai tanggal pembayaran pertama.",
        };
      }),
    );

    for (const rows of chunks(data.payments, 100)) {
      await tx.insert(s.finStudentPayments).values(
        rows.map((p) => ({
          id: crypto.randomUUID(),
          businessUnitId: unitId,
          studentId: studentIds.get(norm(p.student))!,
          kind: p.kind,
          paidOn: p.paidOn,
          amount: p.amount,
          discount: 0,
          // a registration already includes the fee of the month it was paid in; a monthly fee names its month
          period: p.paidOn.slice(0, 7),
          note: p.note,
          createdAt: stamp(p.sheetRow),
          updatedAt: stamp(p.sheetRow),
        })),
      );
    }

    for (const rows of chunks(data.expenses, 100)) {
      await tx.insert(s.finExpenses).values(
        rows.map((e) => ({
          id: crypto.randomUUID(),
          businessUnitId: unitId,
          spentOn: e.spentOn,
          category: e.category,
          name: e.name,
          amount: e.amount,
          attendanceDays: e.attendanceDays,
          dailyRate: e.dailyRate,
          isAsset: false,
          createdAt: stamp(e.sheetRow),
          updatedAt: stamp(e.sheetRow),
        })),
      );
    }

    if (data.openingBalance > 0) {
      await tx.insert(s.finCapital).values({
        id: crypto.randomUUID(),
        businessUnitId: unitId,
        ownerName: "Saldo awal",
        amount: data.openingBalance,
        status: "outstanding",
        note: "Dari “Saldo Awal” di sheet LAPORAN KEUANGAN. Excel tidak menyebut nama pemodal — ganti namanya bila perlu.",
      });
    }
  });

  console.log(`\nunit ${UNIT.code}: imported — ${data.students.length} students, ${data.payments.length} payments, ${data.expenses.length} expenses, modal Rp ${rupiah(data.openingBalance)}`);
  console.log("\nDone.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "Excel import failed");
    process.exit(1);
  });
