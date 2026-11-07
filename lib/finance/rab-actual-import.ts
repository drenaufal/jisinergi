import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessUnits, finActualCosts, finActualItems, finAssets, finBudgetItems } from "@/lib/db/schema";
import type { TFunction } from "@/lib/i18n/translate";
import { isIsoDate } from "./period";
import { parseRabActual } from "./excel/excel-rab-actual";
import { planRabActualImport, type RabActualPlan } from "./excel/rab-actual-plan";
import { readWorkbookBuffer } from "./excel/xlsx-reader";

/* Upload of a RAB Actual workbook ("file RAB Actual.xlsx") into a Liga unit: read it, check its own totals, show what
 * would happen (preview), and write it only when the person confirms. The matching rules are in excel/rab-actual-plan.ts. */

export const MAX_WORKBOOK_BYTES = 8 * 1024 * 1024;

/** A problem the person can fix (wrong file, missing start date…). */
export class UploadRuleError extends Error {}

export type UploadPreview = {
  fileName: string;
  /** The day week 1 starts, when the unit has one already (otherwise the person must give it). */
  unitStartsOn: string | null;
  startsOn: string | null;
  summary: RabActualPlan["summary"];
  checks: { label: string; expected: number; actual: number; ok: boolean }[];
  warnings: string[];
  /** Why the file cannot be loaded as it is (empty = it can). */
  problems: string[];
  /** Names of the RAB lines marked Aset that costs will be booked on: their purchases will show up in Aset. */
  assetCosts: number;
};

type UnitRow = { id: string; name: string; type: "liga" | "sekolah_bola"; active: boolean; programStartsOn: string | null; programWeeks: number };

async function loadUnit(t: TFunction, unitId: string): Promise<UnitRow> {
  const [unit] = await db
    .select({ id: businessUnits.id, name: businessUnits.name, type: businessUnits.type, active: businessUnits.active, programStartsOn: businessUnits.programStartsOn, programWeeks: businessUnits.programWeeks })
    .from(businessUnits)
    .where(eq(businessUnits.id, unitId));
  if (!unit) throw new UploadRuleError(t("Unit bisnis tidak ditemukan."));
  if (unit.type !== "liga") throw new UploadRuleError(t("RAB Actual hanya ada di unit Liga."));
  if (!unit.active) throw new UploadRuleError(t("Unit bisnis ini nonaktif."));
  return unit;
}

async function readExisting(unitId: string) {
  const [existingBudget, existingExtras, existingCosts] = await Promise.all([
    db
      .select({ id: finBudgetItems.id, period: finBudgetItems.period, category: finBudgetItems.category, categoryOrder: finBudgetItems.categoryOrder, name: finBudgetItems.name, itemOrder: finBudgetItems.itemOrder, isAsset: finBudgetItems.isAsset })
      .from(finBudgetItems)
      .where(eq(finBudgetItems.businessUnitId, unitId)),
    db.select({ id: finActualItems.id, period: finActualItems.period, category: finActualItems.category, name: finActualItems.name }).from(finActualItems).where(eq(finActualItems.businessUnitId, unitId)),
    db.select({ budgetItemId: finActualCosts.budgetItemId, actualItemId: finActualCosts.actualItemId, spentOn: finActualCosts.spentOn, amount: finActualCosts.amount }).from(finActualCosts).where(eq(finActualCosts.businessUnitId, unitId)),
  ]);
  return { existingBudget, existingExtras, existingCosts };
}

/** Reads the workbook and works out what loading it into the unit would do. Writes nothing. */
export async function previewRabActualUpload(t: TFunction, input: { unitId: string; fileName: string; bytes: Buffer; startsOn: string | null }) {
  const unit = await loadUnit(t, input.unitId);
  let parsed;
  try {
    parsed = parseRabActual(readWorkbookBuffer(input.bytes));
  } catch {
    throw new UploadRuleError(t("Berkas ini tidak bisa dibaca. Unggah file Excel (.xlsx) RAB Actual yang asli."));
  }

  const problems: string[] = [];
  if (parsed.lines.length === 0 && parsed.costs.length === 0) {
    problems.push(t("Format file tidak dikenali: tidak ada baris RAB maupun biaya actual. Pakai file Excel RAB Actual seperti contohnya (RAB di kiri, Week 1 dst. di kanan)."));
  } else if (parsed.costs.length === 0) {
    problems.push(t("Tidak ada biaya actual di file ini (kolom Week kosong)."));
  }
  const checks = parsed.checks.map((c) => ({ ...c, ok: c.expected === c.actual }));
  for (const c of checks) if (!c.ok) problems.push(t("Total di file tidak cocok dengan hasil bacaan: {label}.", { label: c.label }));

  const startsOn = unit.programStartsOn ?? (input.startsOn && isIsoDate(input.startsOn) ? input.startsOn : null);
  if (!startsOn && parsed.costs.length > 0) problems.push(t("Isi tanggal mulai minggu 1: file hanya menyebut “Week n”, jadi tanggalnya dibutuhkan untuk menaruh biaya di minggu yang benar."));

  const existing = await readExisting(unit.id);
  const plan = planRabActualImport({ parsed, startsOn: startsOn ?? "2000-01-03", ...existing });
  if (parsed.costs.length > 0 && plan.costs.length === 0 && plan.summary.costs.duplicates > 0) problems.push(t("Semua biaya di file ini sudah tercatat di unit ini."));

  const warnings = [...parsed.warnings];
  if (plan.summary.costs.lastWeek > unit.programWeeks) {
    warnings.push(t("File memuat sampai minggu ke-{n}, lebih panjang dari program unit ({weeks} minggu).", { n: plan.summary.costs.lastWeek, weeks: unit.programWeeks }));
  }

  const preview: UploadPreview = {
    fileName: input.fileName,
    unitStartsOn: unit.programStartsOn,
    startsOn,
    summary: plan.summary,
    checks,
    warnings,
    problems,
    assetCosts: plan.costs.filter((c) => c.isAsset).length,
  };
  return { unit, parsed, plan, preview, startsOn };
}

/** Loads the workbook into the unit: missing RAB lines, extra lines, the costs (and the assets bought with them) in one transaction. */
export async function importRabActualUpload(t: TFunction, input: { unitId: string; fileName: string; bytes: Buffer; startsOn: string | null; actorId: string }) {
  const { unit, plan, preview, startsOn } = await previewRabActualUpload(t, input);
  if (preview.problems.length || !startsOn) throw new UploadRuleError(preview.problems[0] ?? t("File ini belum bisa dimuat."));

  const chunks = <T,>(rows: T[], n: number) => Array.from({ length: Math.ceil(rows.length / n) }, (_, i) => rows.slice(i * n, (i + 1) * n));
  const costIds = plan.costs.map(() => crypto.randomUUID());

  await db.transaction(async (tx) => {
    if (!unit.programStartsOn) await tx.update(businessUnits).set({ programStartsOn: startsOn }).where(eq(businessUnits.id, unit.id));
    for (const rows of chunks(plan.newLines, 100)) {
      await tx.insert(finBudgetItems).values(rows.map((l) => ({ ...l, businessUnitId: unit.id, createdBy: input.actorId })));
    }
    if (plan.newExtras.length) await tx.insert(finActualItems).values(plan.newExtras.map((e) => ({ ...e, businessUnitId: unit.id, createdBy: input.actorId })));
    for (const rows of chunks(plan.costs.map((c, i) => ({ c, id: costIds[i] })), 100)) {
      await tx.insert(finActualCosts).values(
        rows.map(({ c, id }) => ({ id, businessUnitId: unit.id, createdBy: input.actorId, budgetItemId: c.budgetItemId, actualItemId: c.actualItemId, amount: c.amount, spentOn: c.spentOn, note: c.note })),
      );
    }
    // a cost booked on a RAB line marked Aset is a purchase: it shows up in Aset (worth what was paid, on the day it was paid)
    const assets = plan.costs.map((c, i) => ({ c, id: costIds[i] })).filter(({ c }) => c.isAsset);
    for (const rows of chunks(assets, 100)) {
      await tx.insert(finAssets).values(
        rows.map(({ c, id }) => ({
          id: crypto.randomUUID(),
          businessUnitId: unit.id,
          createdBy: input.actorId,
          actualCostId: id,
          purchasedOn: c.spentOn,
          name: c.lineName.slice(0, 160),
          amount: c.amount,
          note: c.note ? `${t("Dibuat otomatis dari RAB Actual")} · ${c.note}`.slice(0, 500) : t("Dibuat otomatis dari RAB Actual"),
        })),
      );
    }
  });
  return { unit, plan, preview };
}
