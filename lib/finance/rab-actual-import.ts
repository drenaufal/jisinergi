import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessUnits, finActualCosts, finActualItems, finAssets, finBudgetItems } from "@/lib/db/schema";
import type { TFunction } from "@/lib/i18n/translate";
import { programStart } from "./calc";
import { isIsoDate } from "./period";
import { parseRabActual } from "./excel/excel-rab-actual";
import { planRabActualImport, type RabActualPlan } from "./excel/rab-actual-plan";
import { parseActualTemplate, parseBudgetTemplate, resolveActualRows } from "./excel/rab-templates";
import { readWorkbookBuffer, type Workbook } from "./excel/xlsx-reader";
import { norm, type ParsedUnit } from "./excel/excel-types";

/* Upload of an Excel file into a Liga unit — RAB Budget (the template) or RAB Actual (the template, or the old
 * "file RAB Actual.xlsx" workbook): read it, check it, show what would happen (preview), and write it only when the
 * person confirms. The matching rules are in excel/rab-actual-plan.ts, the template format in excel/rab-templates.ts. */

export const MAX_WORKBOOK_BYTES = 8 * 1024 * 1024;

export type UploadTarget = "budget" | "actual";

/** A problem the person can fix (wrong file, missing start date…). */
export class UploadRuleError extends Error {}

export type UploadPreview = {
  target: UploadTarget;
  fileName: string;
  /** "template": the app's template; "legacy": the old RAB Actual workbook (Week columns, no dates). */
  format: "template" | "legacy";
  /** The day week 1 starts, when the unit has one already. */
  unitStartsOn: string | null;
  startsOn: string | null;
  /** The file only names weeks (old workbook) and the unit has no start date: the person must give one. */
  needsStartsOn: boolean;
  summary: RabActualPlan["summary"];
  checks: { label: string; expected: number; actual: number; ok: boolean }[];
  warnings: string[];
  /** Why the file cannot be loaded as it is (empty = it can). */
  problems: string[];
  /** Costs booked on RAB lines marked Aset: their purchases will show up in Aset. */
  assetCosts: number;
};

type UnitRow = { id: string; name: string; type: "liga" | "sekolah_bola"; active: boolean; programStartsOn: string | null; programWeeks: number };

export async function loadLigaUnit(t: TFunction, unitId: string, target: UploadTarget): Promise<UnitRow> {
  const [unit] = await db
    .select({ id: businessUnits.id, name: businessUnits.name, type: businessUnits.type, active: businessUnits.active, programStartsOn: businessUnits.programStartsOn, programWeeks: businessUnits.programWeeks })
    .from(businessUnits)
    .where(eq(businessUnits.id, unitId));
  if (!unit) throw new UploadRuleError(t("Unit bisnis tidak ditemukan."));
  if (unit.type !== "liga") throw new UploadRuleError(target === "budget" ? t("RAB Budget hanya ada di unit Liga.") : t("RAB Actual hanya ada di unit Liga."));
  if (!unit.active) throw new UploadRuleError(t("Unit bisnis ini nonaktif."));
  return unit;
}

export async function readExisting(unitId: string) {
  const [existingBudget, existingExtras, existingCosts] = await Promise.all([
    db
      .select({
        id: finBudgetItems.id,
        period: finBudgetItems.period,
        category: finBudgetItems.category,
        categoryOrder: finBudgetItems.categoryOrder,
        name: finBudgetItems.name,
        itemOrder: finBudgetItems.itemOrder,
        isAsset: finBudgetItems.isAsset,
        quantity: finBudgetItems.quantity,
        unitPrice: finBudgetItems.unitPrice,
      })
      .from(finBudgetItems)
      .where(eq(finBudgetItems.businessUnitId, unitId)),
    db.select({ id: finActualItems.id, period: finActualItems.period, category: finActualItems.category, name: finActualItems.name }).from(finActualItems).where(eq(finActualItems.businessUnitId, unitId)),
    db.select({ budgetItemId: finActualCosts.budgetItemId, actualItemId: finActualCosts.actualItemId, spentOn: finActualCosts.spentOn, amount: finActualCosts.amount }).from(finActualCosts).where(eq(finActualCosts.businessUnitId, unitId)),
  ]);
  return { existingBudget, existingExtras, existingCosts };
}

function readFile(t: TFunction, bytes: Buffer): Workbook {
  try {
    return readWorkbookBuffer(bytes);
  } catch {
    throw new UploadRuleError(t("Berkas ini tidak bisa dibaca. Unggah file Excel (.xlsx) yang asli, misalnya template yang diunduh dari halaman ini."));
  }
}

/* ── RAB Actual ────────────────────────────────────────────────────── */

/** Reads the workbook and works out what loading it into RAB Actual would do. Writes nothing. */
export async function previewRabActualUpload(t: TFunction, input: { unitId: string; fileName: string; bytes: Buffer; startsOn: string | null }) {
  const unit = await loadLigaUnit(t, input.unitId, "actual");
  const wb = readFile(t, input.bytes);
  const existing = await readExisting(unit.id);
  const problems: string[] = [];
  const warnings: string[] = [];

  let parsed: ParsedUnit;
  let format: UploadPreview["format"];
  let startsOn: string | null;
  const template = parseActualTemplate(wb);
  if (template) {
    format = "template";
    const resolved = resolveActualRows(template.rows, existing.existingBudget, existing.existingExtras);
    parsed = resolved.parsed;
    problems.push(...template.problems, ...resolved.problems);
    if (template.count === 0) problems.push(t("Template masih kosong: isi biayanya mulai baris 5 di sheet “RAB Actual”."));
    if (resolved.outside.length) {
      warnings.push(t("Tidak ada di RAB Budget, jadi dibuat sebagai baris di luar RAB: {names}. Periksa ejaannya bila seharusnya sama dengan baris RAB.", { names: resolved.outside.join(", ") }));
    }
    // dates are in the file: week 1 is the unit's start date, else the Monday of the first cost (as on the page)
    startsOn = programStart(unit.programStartsOn, [...existing.existingCosts.map((c) => c.spentOn), ...parsed.costs.map((c) => c.spentOn!)]);
  } else {
    format = "legacy";
    try {
      parsed = parseRabActual(wb);
    } catch {
      throw new UploadRuleError(t("Format file tidak dikenali. Unduh template RAB Actual dari halaman ini, isi, lalu unggah kembali."));
    }
    if (parsed.lines.length === 0 && parsed.costs.length === 0) {
      problems.push(t("Format file tidak dikenali. Unduh template RAB Actual dari halaman ini, isi, lalu unggah kembali."));
    } else if (parsed.costs.length === 0) {
      problems.push(t("Tidak ada biaya actual di file ini (kolom Week kosong)."));
    }
    warnings.push(...parsed.warnings);
    startsOn = unit.programStartsOn ?? (input.startsOn && isIsoDate(input.startsOn) ? input.startsOn : null);
    if (!startsOn && parsed.costs.length > 0) problems.push(t("Isi tanggal mulai minggu 1: file hanya menyebut “Week n”, jadi tanggalnya dibutuhkan untuk menaruh biaya di minggu yang benar."));
  }

  const checks = parsed.checks.map((c) => ({ ...c, ok: c.expected === c.actual }));
  for (const c of checks) if (!c.ok) problems.push(t("Total di file tidak cocok dengan hasil bacaan: {label}.", { label: c.label }));

  const plan = planRabActualImport({ parsed, startsOn: startsOn ?? "2000-01-03", ...existing });
  if (parsed.costs.length > 0 && plan.costs.length === 0 && plan.summary.costs.duplicates > 0) problems.push(t("Semua biaya di file ini sudah tercatat di unit ini."));
  if (plan.summary.costs.lastWeek > unit.programWeeks) {
    warnings.push(t("File memuat sampai minggu ke-{n}, lebih panjang dari program unit ({weeks} minggu).", { n: plan.summary.costs.lastWeek, weeks: unit.programWeeks }));
  }

  const preview: UploadPreview = {
    target: "actual",
    fileName: input.fileName,
    format,
    unitStartsOn: unit.programStartsOn,
    startsOn,
    needsStartsOn: format === "legacy" && !unit.programStartsOn,
    summary: plan.summary,
    checks,
    warnings,
    problems,
    assetCosts: plan.costs.filter((c) => c.isAsset).length,
  };
  return { unit, plan, preview, startsOn, format };
}

/** Loads the workbook into RAB Actual: missing RAB lines, extra lines, the costs (and the assets bought with them) in one transaction. */
export async function importRabActualUpload(t: TFunction, input: { unitId: string; fileName: string; bytes: Buffer; startsOn: string | null; actorId: string }) {
  const { unit, plan, preview, startsOn, format } = await previewRabActualUpload(t, input);
  if (preview.problems.length || (format === "legacy" && !startsOn)) throw new UploadRuleError(preview.problems[0] ?? t("File ini belum bisa dimuat."));

  const costIds = plan.costs.map(() => crypto.randomUUID());
  await db.transaction(async (tx) => {
    // only the old workbook asks for a start date; a template carries real dates
    if (format === "legacy" && !unit.programStartsOn && startsOn) await tx.update(businessUnits).set({ programStartsOn: startsOn }).where(eq(businessUnits.id, unit.id));
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

/* ── RAB Budget ────────────────────────────────────────────────────── */

/** Reads a RAB Budget template and works out which lines it would add. Lines the unit already has are skipped. Writes nothing. */
export async function previewRabBudgetUpload(t: TFunction, input: { unitId: string; fileName: string; bytes: Buffer }) {
  const unit = await loadLigaUnit(t, input.unitId, "budget");
  const wb = readFile(t, input.bytes);
  const result = parseBudgetTemplate(wb);
  if (!result) throw new UploadRuleError(t("Format file tidak dikenali. Unduh template RAB Budget dari halaman ini, isi, lalu unggah kembali."));

  const existing = await readExisting(unit.id);
  const problems = [...result.problems];
  if (result.rows === 0) problems.push(t("Template masih kosong: isi baris RAB mulai baris 5 di sheet “RAB Budget”."));
  const plan = planRabActualImport({ parsed: result.parsed, startsOn: "2000-01-03", existingBudget: existing.existingBudget, existingExtras: [], existingCosts: [] });

  const warnings: string[] = [];
  const key = (l: { period: string; category: string; name: string }) => `${l.period}|${norm(l.category)}|${norm(l.name)}`;
  const created = new Set(plan.newLines.map(key));
  const skipped = result.parsed.lines.filter((l) => !created.has(key(l))).map((l) => `${l.name} (${l.category})`);
  if (skipped.length) warnings.push(t("Sudah ada di RAB Budget, jadi dilewati: {names}.", { names: skipped.join(", ") }));
  if (result.parsed.lines.length > 0 && plan.newLines.length === 0 && !problems.length) problems.push(t("Semua baris di file ini sudah ada di RAB Budget unit ini."));

  const preview: UploadPreview = {
    target: "budget",
    fileName: input.fileName,
    format: "template",
    unitStartsOn: unit.programStartsOn,
    startsOn: null,
    needsStartsOn: false,
    summary: plan.summary,
    checks: [],
    warnings,
    problems,
    assetCosts: 0,
  };
  return { unit, plan, preview, newTotal: plan.newLines.reduce((a, l) => a + l.quantity * l.unitPrice, 0) };
}

/** Adds the new RAB Budget lines of the template in one transaction. A saved line is final, so nothing existing is changed. */
export async function importRabBudgetUpload(t: TFunction, input: { unitId: string; fileName: string; bytes: Buffer; actorId: string }) {
  const { unit, plan, preview, newTotal } = await previewRabBudgetUpload(t, input);
  if (preview.problems.length) throw new UploadRuleError(preview.problems[0]);
  await db.transaction(async (tx) => {
    for (const rows of chunks(plan.newLines, 100)) {
      await tx.insert(finBudgetItems).values(rows.map((l) => ({ ...l, businessUnitId: unit.id, createdBy: input.actorId })));
    }
  });
  return { unit, plan, preview, newTotal };
}

function chunks<T>(rows: T[], n: number) {
  return Array.from({ length: Math.ceil(rows.length / n) }, (_, i) => rows.slice(i * n, (i + 1) * n));
}
