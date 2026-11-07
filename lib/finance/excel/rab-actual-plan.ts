/**
 * What uploading a RAB Actual workbook to a unit would do — decided here, in plain data, so the preview and the real
 * import cannot disagree and so scripts/test-finance.ts can check it without a database.
 *
 * Lines of the workbook are matched to what the unit already has (same part of the sheet, category and name); only the
 * missing ones are created. Costs are dated on the first day of their program week. A cost that the unit already has
 * (same line, date and amount) is skipped, so loading the same file twice does not double the spending.
 */
import { weekStartDate } from "../calc";
import { norm, tidy, type ParsedUnit, type Period } from "./excel-types";

export type ExistingLine = { id: string; period: Period; category: string; categoryOrder: number; name: string; itemOrder: number; isAsset: boolean };
export type ExistingExtra = { id: string; period: Period; category: string; name: string };
export type ExistingCost = { budgetItemId: string | null; actualItemId: string | null; spentOn: string; amount: number };

export type PlannedLine = { id: string; period: Period; category: string; categoryOrder: number; name: string; itemOrder: number; quantity: number; unitPrice: number; note: string | null; isAsset: boolean };
export type PlannedExtra = { id: string; period: Period; category: string; name: string };
export type PlannedCost = {
  /** Exactly one of the two is set: the RAB line (new or already there) or the extra line the money was spent on. */
  budgetItemId: string | null;
  actualItemId: string | null;
  week: number;
  spentOn: string;
  amount: number;
  note: string | null;
  /** The cost is on a RAB line marked Aset, so it also becomes a row in ASET. */
  isAsset: boolean;
  lineName: string;
};

export type RabActualPlan = {
  newLines: PlannedLine[];
  newExtras: PlannedExtra[];
  costs: PlannedCost[];
  /** Counts for the preview. */
  summary: {
    lines: { total: number; weekly: number; monthly: number; asset: number; existing: number; created: number };
    extras: { total: number; existing: number; created: number };
    costs: { total: number; amount: number; duplicates: number; imported: number; importedAmount: number; lastWeek: number };
  };
};

const lineKey = (period: Period, category: string, name: string) => `${period}|${norm(category)}|${norm(name)}`;
const nameKey = (category: string, name: string) => `${norm(category)}|${norm(name)}`;

export function planRabActualImport(input: { parsed: ParsedUnit; startsOn: string; existingBudget: readonly ExistingLine[]; existingExtras: readonly ExistingExtra[]; existingCosts: readonly ExistingCost[] }): RabActualPlan {
  const { parsed, startsOn } = input;

  /* ── RAB lines: reuse what the unit has, create the rest ── */
  const known = new Map<string, ExistingLine>();
  for (const l of input.existingBudget) if (!known.has(lineKey(l.period, l.category, l.name))) known.set(lineKey(l.period, l.category, l.name), l);
  const knownByName = new Map<string, ExistingLine>();
  for (const l of input.existingBudget) if (!knownByName.has(nameKey(l.category, l.name))) knownByName.set(nameKey(l.category, l.name), l);

  const orderOf = new Map<string, { categoryOrder: number; items: number }>(); // `${period}|${norm(category)}`
  for (const l of input.existingBudget) {
    const key = `${l.period}|${norm(l.category)}`;
    const cur = orderOf.get(key) ?? { categoryOrder: l.categoryOrder, items: 0 };
    cur.items = Math.max(cur.items, l.itemOrder);
    orderOf.set(key, cur);
  }
  const lastCategory: Record<Period, number> = { weekly: 0, monthly: 0 };
  for (const l of input.existingBudget) lastCategory[l.period] = Math.max(lastCategory[l.period], l.categoryOrder);

  const newLines: PlannedLine[] = [];
  const lineTarget: { id: string; name: string; isAsset: boolean }[] = []; // per parsed line
  const placed = new Map<string, { id: string; name: string; isAsset: boolean }>(); // new lines by key (duplicates in the file merge)
  parsed.lines.forEach((l) => {
    const key = lineKey(l.period, tidy(l.category), tidy(l.name));
    const hit = known.get(key);
    if (hit) return void lineTarget.push({ id: hit.id, name: hit.name, isAsset: hit.isAsset });
    const again = placed.get(key);
    if (again) return void lineTarget.push(again);
    const catKey = `${l.period}|${norm(l.category)}`;
    let cat = orderOf.get(catKey);
    if (!cat) orderOf.set(catKey, (cat = { categoryOrder: ++lastCategory[l.period], items: 0 }));
    const planned: PlannedLine = {
      id: crypto.randomUUID(),
      period: l.period,
      category: tidy(l.category),
      categoryOrder: cat.categoryOrder,
      name: tidy(l.name),
      itemOrder: ++cat.items,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      note: l.note,
      isAsset: l.isAsset,
    };
    newLines.push(planned);
    const target = { id: planned.id, name: planned.name, isAsset: planned.isAsset };
    placed.set(key, target);
    lineTarget.push(target);
  });

  /* ── lines outside the RAB: a RAB line of the same name wins, then an existing extra line, else a new one ── */
  const extraKnown = new Map<string, ExistingExtra>();
  for (const e of input.existingExtras) if (!extraKnown.has(nameKey(e.category, e.name))) extraKnown.set(nameKey(e.category, e.name), e);
  const newExtras: PlannedExtra[] = [];
  const extraTarget: ({ budgetItemId: string; name: string; isAsset: boolean } | { actualItemId: string; name: string })[] = [];
  const extraPlaced = new Map<string, PlannedExtra>();
  parsed.extras.forEach((e) => {
    const key = nameKey(tidy(e.category), tidy(e.name));
    const inRab = knownByName.get(key);
    if (inRab) return void extraTarget.push({ budgetItemId: inRab.id, name: inRab.name, isAsset: inRab.isAsset });
    const inFile = newLines.find((l) => nameKey(l.category, l.name) === key);
    if (inFile) return void extraTarget.push({ budgetItemId: inFile.id, name: inFile.name, isAsset: inFile.isAsset });
    const have = extraKnown.get(key);
    if (have) return void extraTarget.push({ actualItemId: have.id, name: have.name });
    let planned = extraPlaced.get(key);
    if (!planned) {
      planned = { id: crypto.randomUUID(), period: e.period, category: tidy(e.category), name: tidy(e.name) };
      newExtras.push(planned);
      extraPlaced.set(key, planned);
    }
    extraTarget.push({ actualItemId: planned.id, name: planned.name });
  });

  /* ── costs: one per cell of the sheet, dated on the first day of its week; what the unit already has is skipped ── */
  const have = new Map<string, number>();
  const costKey = (c: { budgetItemId: string | null; actualItemId: string | null; spentOn: string; amount: number }) => `${c.budgetItemId ?? `a:${c.actualItemId}`}|${c.spentOn}|${c.amount}`;
  for (const c of input.existingCosts) have.set(costKey(c), (have.get(costKey(c)) ?? 0) + 1);

  const costs: PlannedCost[] = [];
  let duplicates = 0;
  for (const c of parsed.costs) {
    const t = "line" in c.target ? lineTarget[c.target.line] : extraTarget[c.target.extra];
    const budgetItemId = t && "id" in t ? t.id : t && "budgetItemId" in t ? t.budgetItemId : null;
    const actualItemId = t && "actualItemId" in t ? t.actualItemId : null;
    if (!t || (!budgetItemId && !actualItemId)) continue;
    const spentOn = weekStartDate(startsOn, c.week);
    const planned: PlannedCost = { budgetItemId, actualItemId, week: c.week, spentOn, amount: c.amount, note: c.note, isAsset: "isAsset" in t ? t.isAsset : false, lineName: t.name };
    const left = have.get(costKey(planned)) ?? 0;
    if (left > 0) {
      have.set(costKey(planned), left - 1);
      duplicates += 1;
      continue;
    }
    costs.push(planned);
  }

  const sum = (rows: readonly { amount: number }[]) => rows.reduce((a, r) => a + r.amount, 0);
  return {
    newLines,
    newExtras,
    costs,
    summary: {
      lines: {
        total: parsed.lines.length,
        weekly: parsed.lines.filter((l) => l.period === "weekly").length,
        monthly: parsed.lines.filter((l) => l.period === "monthly").length,
        asset: parsed.lines.filter((l) => l.isAsset).length,
        existing: parsed.lines.length - newLines.length,
        created: newLines.length,
      },
      extras: { total: parsed.extras.length, existing: parsed.extras.length - newExtras.length, created: newExtras.length },
      costs: {
        total: parsed.costs.length,
        amount: sum(parsed.costs),
        duplicates,
        imported: costs.length,
        importedAmount: sum(costs),
        lastWeek: Math.max(0, ...parsed.costs.map((c) => c.week)),
      },
    },
  };
}
