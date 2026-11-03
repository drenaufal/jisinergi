import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readWorkbook, type Workbook } from "./lib/xlsx-reader";
import { parseRabActual } from "./lib/excel-rab-actual";
import { parseLaporan } from "./lib/excel-laporan";
import type { ParsedUnit } from "./lib/excel-types";

/**
 * Loads the two sample workbooks the unit admins keep into the database as two Liga units, so every screen can be tried
 * with real figures and real transfer proofs:
 *
 *   "file RAB Actual.xlsx"                       → LIGA-RAB   RAB + RAB Actual (weekly and monthly, cell comments)
 *   "LAPORAN PENGELUARAN SEKOLAH BOLA.xlsx"      → LIGA-IYFL  clubs per age group (registration, match fee, other income)
 *                                                              and the RAB with a transfer proof per week
 *
 *   npm run db:import:excel -- --rab-actual "<file>" --laporan "<file>"
 *   npm run db:import:excel -- --dry-run         read the files, check their totals, write nothing
 *   npm run db:import:excel -- --reset           replace the two units with a fresh import
 *   npm run db:import:excel -- --remove          delete the two units, their data and their receipts (no undo)
 *
 * Without file options it looks for the files in your Downloads folder (or RAB_ACTUAL_XLSX / LAPORAN_XLSX). A unit that
 * already exists is left alone unless --reset is given. The target database is whatever DATABASE_URL points at.
 * Nothing is written when a total read from a sheet differs from the total the sheet states for itself.
 */

type Dataset = {
  key: "rabActual" | "laporan";
  file: string;
  code: string;
  name: string;
  description: string;
  /** First day of week 1. The sheets only say "week n", so every cost is dated on the first day of its week. */
  startsOn: string;
  parse: (wb: Workbook) => ParsedUnit;
};

const DOWNLOADS = join(homedir(), "Downloads");

function arg(name: string) {
  const args = process.argv.slice(2);
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}
const flag = (name: string, npmKey: string) => process.argv.includes(name) || process.env[`npm_config_${npmKey}`] === "true";

function datasets(): Dataset[] {
  return [
    {
      key: "rabActual",
      file: arg("--rab-actual") ?? process.env.RAB_ACTUAL_XLSX ?? join(DOWNLOADS, "file RAB Actual.xlsx"),
      code: "LIGA-RAB",
      name: "Liga RAB Actual (contoh Excel)",
      description: "Contoh dari “file RAB Actual.xlsx”: RAB mingguan dan bulanan beserta biaya actual 10 minggu.",
      startsOn: "2026-10-02",
      parse: parseRabActual,
    },
    {
      key: "laporan",
      file: arg("--laporan") ?? process.env.LAPORAN_XLSX ?? join(DOWNLOADS, "LAPORAN PENGELUARAN SEKOLAH BOLA.xlsx"),
      code: "LIGA-IYFL",
      name: "Liga U8–U11 (contoh Excel)",
      description: "Contoh dari “LAPORAN PENGELUARAN SEKOLAH BOLA.xlsx”: registrasi, match fee, dan RAB dengan bukti transfer.",
      startsOn: "2026-10-10",
      parse: parseLaporan,
    },
  ];
}

const rupiah = (n: number) => n.toLocaleString("id-ID");

async function main() {
  const args = process.argv.slice(2);
  const known = /^(--dry-run|--reset|--remove|--rab-actual|--laporan)$/;
  const stray = args.filter((a, i) => a.startsWith("--") && !known.test(a) && args[i - 1] !== "--rab-actual" && args[i - 1] !== "--laporan");
  if (stray.length) throw new Error('Usage: npm run db:import:excel -- [--rab-actual "<file>"] [--laporan "<file>"] [--dry-run] [--reset] [--remove]');
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
    for (const d of datasets()) {
      const r = await removeUnit(db, d.code, { dryRun });
      console.log(r.found ? `unit ${d.code.padEnd(10)} ${dryRun ? "would remove" : "removed"}: ${Object.values(r.rows).reduce((a, b) => a + b, 0)} rows, ${r.receipts} receipts` : `unit ${d.code.padEnd(10)} not found`);
    }
    return;
  }

  let failed = false;
  const parsed: { dataset: Dataset; wb: Workbook; data: ParsedUnit }[] = [];
  for (const dataset of datasets()) {
    if (!existsSync(dataset.file)) {
      console.log(`\n${dataset.code}: file not found — ${dataset.file}\n  give it with ${dataset.key === "rabActual" ? "--rab-actual" : "--laporan"} "<path>"`);
      failed = true;
      continue;
    }
    const wb = readWorkbook(dataset.file);
    const data = dataset.parse(wb);
    const proofs = new Set<string>();
    console.log(`\n${dataset.code} ← ${dataset.file}`);
    console.log(`  RAB: ${data.lines.length} baris (${data.lines.filter((l) => l.period === "weekly").length} mingguan, ${data.lines.filter((l) => l.period === "monthly").length} bulanan, ${data.lines.filter((l) => l.isAsset).length} aset), ${data.extras.length} di luar RAB`);
    console.log(`  Biaya actual: ${data.costs.length} catatan, Rp ${rupiah(data.costs.reduce((a, c) => a + c.amount, 0))}`);
    if (data.registrations.length || data.matchFees.length || data.otherIncome.length) {
      console.log(`  Registrasi: ${data.registrations.length} klub · Match fee: ${data.matchFees.length} baris · Pemasukan lain: ${data.otherIncome.length}`);
    }
    for (const x of [...data.costs.map((c) => c.image), ...data.registrations.flatMap((x) => [x.dpImage, x.finalImage]), ...data.matchFees.map((m) => m.image), ...data.otherIncome.map((o) => o.image)]) if (x) proofs.add(x);
    console.log(`  Foto bukti: ${proofs.size} (${wb.images.size} foto di file)`);
    for (const c of data.checks) {
      const same = c.expected === c.actual;
      if (!same) failed = true;
      console.log(`  ${same ? "✓" : "✗"} ${c.label}: ${rupiah(c.actual)}${same ? "" : `  (file: ${rupiah(c.expected)})`}`);
    }
    for (const w of data.warnings) console.log(`  ! ${w}`);
    parsed.push({ dataset, wb, data });
  }
  if (failed) throw new Error("Nothing was written: fix the file(s) or the importer first.");
  if (dryRun) {
    console.log("\nDry run: nothing was written.");
    return;
  }

  const { db } = await import("@/lib/db");
  const s = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const { removeUnit } = await import("@/lib/finance/remove");
  const { weekStartDate } = await import("@/lib/finance/calc");

  for (const { dataset, wb, data } of parsed) {
    const [found] = await db.select({ id: s.businessUnits.id }).from(s.businessUnits).where(eq(s.businessUnits.code, dataset.code));
    if (found && !reset) {
      console.log(`\nunit ${dataset.code}: already there, skipped (use --reset to replace it)`);
      continue;
    }
    if (found) await removeUnit(db, dataset.code);

    const unitId = crypto.randomUUID();
    const media: (typeof s.media.$inferInsert)[] = [];
    // The same picture is used in several cells; every row gets its own copy, so deleting one row's receipt keeps the others.
    const proof = (image: string | null) => {
      const picture = image ? wb.images.get(image) : undefined;
      if (!picture) return null;
      const id = crypto.randomUUID();
      media.push({
        id,
        kind: "document",
        fileName: `${picture.description ?? `bukti-${picture.id.slice(3, 11)}`}.${picture.mime === "image/png" ? "png" : "jpeg"}`,
        mimeType: picture.mime,
        size: picture.bytes.length,
        data: picture.bytes.toString("base64"),
        uploadedBy: null,
      });
      return `/api/media/${id}`;
    };
    const programWeeks = 10;
    const dateOf = (week: number) => weekStartDate(dataset.startsOn, week);
    const lineIds = data.lines.map(() => crypto.randomUUID());
    const extraIds = data.extras.map(() => crypto.randomUUID());
    const chunks = <T,>(rows: T[], n: number) => Array.from({ length: Math.ceil(rows.length / n) }, (_, i) => rows.slice(i * n, (i + 1) * n));

    await db.transaction(async (tx) => {
      await tx.insert(s.businessUnits).values({ id: unitId, code: dataset.code, name: dataset.name, type: "liga", description: dataset.description, programWeeks, programStartsOn: dataset.startsOn });

      for (const rows of chunks(data.lines, 100)) {
        await tx.insert(s.finBudgetItems).values(
          rows.map((l) => ({
            id: lineIds[data.lines.indexOf(l)],
            businessUnitId: unitId,
            period: l.period,
            category: l.category,
            categoryOrder: l.categoryOrder,
            name: l.name,
            itemOrder: l.itemOrder,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            isAsset: l.isAsset,
            note: l.note,
          })),
        );
      }
      // an asset line of the RAB is also a row in Aset (worth the line's budget over the program), dated at its first cost
      const assetLines = data.lines.map((l, i) => ({ l, i })).filter((x) => x.l.isAsset);
      if (assetLines.length) {
        await tx.insert(s.finAssets).values(
          assetLines.map(({ l, i }) => {
            const first = Math.min(...data.costs.filter((c) => "line" in c.target && c.target.line === i).map((c) => c.week), Infinity);
            return {
              id: crypto.randomUUID(),
              businessUnitId: unitId,
              budgetItemId: lineIds[i],
              purchasedOn: Number.isFinite(first) ? dateOf(first) : dataset.startsOn,
              name: l.name.slice(0, 160),
              amount: l.quantity * l.unitPrice * (l.period === "weekly" ? programWeeks : 1),
              note: "Dibuat otomatis dari RAB",
            };
          }),
        );
      }
      if (data.extras.length) {
        await tx.insert(s.finActualItems).values(data.extras.map((e, i) => ({ id: extraIds[i], businessUnitId: unitId, period: e.period, category: e.category, name: e.name })));
      }
      for (const rows of chunks(data.costs, 100)) {
        await tx.insert(s.finActualCosts).values(
          rows.map((c) => ({
            id: crypto.randomUUID(),
            businessUnitId: unitId,
            budgetItemId: "line" in c.target ? lineIds[c.target.line] : null,
            actualItemId: "extra" in c.target ? extraIds[c.target.extra] : null,
            amount: c.amount,
            spentOn: dateOf(c.week),
            proofUrl: proof(c.image),
            note: c.note,
          })),
        );
      }
      if (data.registrations.length) {
        await tx.insert(s.finRegistrations).values(
          data.registrations.map((x) => ({
            id: crypto.randomUUID(),
            businessUnitId: unitId,
            ageGroup: x.ageGroup,
            clubName: x.clubName,
            fee: x.fee,
            dpAmount: x.dpAmount,
            dpProofUrl: proof(x.dpImage),
            finalAmount: x.finalAmount,
            finalProofUrl: proof(x.finalImage),
            note: x.note,
          })),
        );
      }
      for (const rows of chunks(data.matchFees, 100)) {
        await tx.insert(s.finMatchFees).values(
          rows.map((m) => ({ id: crypto.randomUUID(), businessUnitId: unitId, ageGroup: m.ageGroup, clubName: m.clubName, week: m.week, matches: m.matches, feePerMatch: m.feePerMatch, proofUrl: proof(m.image) })),
        );
      }
      if (data.otherIncome.length) {
        await tx.insert(s.finOtherIncome).values(data.otherIncome.map((o) => ({ id: crypto.randomUUID(), businessUnitId: unitId, name: o.name, week: o.week, amount: o.amount, proofUrl: proof(o.image) })));
      }
      for (const rows of chunks(media, 8)) await tx.insert(s.media).values(rows);
    });
    const bytes = media.reduce((a, m) => a + m.size, 0);
    console.log(`\nunit ${dataset.code}: imported — ${data.lines.length} RAB lines, ${data.costs.length} costs, ${data.registrations.length} registrations, ${data.matchFees.length} match fees, ${data.otherIncome.length} other income, ${media.length} receipts (${(bytes / 1e6).toFixed(1)} MB)`);
  }
  console.log("\nDone.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "Excel import failed");
    process.exit(1);
  });
