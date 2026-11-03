/**
 * What the Excel importers hand to the database writer (scripts/import-excel.ts): plain data, no ids. Pictures are
 * kept as the workbook's own picture ids and become uploaded receipts when written.
 */

export type Period = "weekly" | "monthly";

/** A RAB line. A saved RAB line is final, so everything the RAB form asks is decided here. */
export type ParsedLine = {
  period: Period;
  category: string;
  categoryOrder: number;
  name: string;
  itemOrder: number;
  quantity: number;
  unitPrice: number;
  note: string | null;
  isAsset: boolean;
};

/** A cost line that is not in the RAB (an "extra" line of RAB Actual). */
export type ParsedExtra = { period: Period; category: string; name: string };

/** Money really spent in program week `week` on a RAB line (`line`: index into lines) or an extra line (`extra`). */
export type ParsedCost = { target: { line: number } | { extra: number }; week: number; amount: number; image: string | null; note: string | null };

export type ParsedRegistration = {
  ageGroup: string;
  clubName: string;
  fee: number;
  dpAmount: number;
  dpImage: string | null;
  finalAmount: number;
  finalImage: string | null;
  note: string | null;
};

export type ParsedMatchFee = { ageGroup: string; clubName: string; week: number; matches: number; feePerMatch: number; image: string | null };
export type ParsedOtherIncome = { name: string; week: number; amount: number; image: string | null };

export type ParsedUnit = {
  lines: ParsedLine[];
  extras: ParsedExtra[];
  costs: ParsedCost[];
  registrations: ParsedRegistration[];
  matchFees: ParsedMatchFee[];
  otherIncome: ParsedOtherIncome[];
  /** Totals the workbook states itself, against what was read: the importer prints them and stops on a mismatch. */
  checks: { label: string; expected: number; actual: number }[];
  warnings: string[];
};

export const emptyParsed = (): ParsedUnit => ({ lines: [], extras: [], costs: [], registrations: [], matchFees: [], otherIncome: [], checks: [], warnings: [] });

/** Lower-case letters and digits only, to compare names that differ in spacing or punctuation. */
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** "  BSS   Jakarta " → "BSS Jakarta". */
export const tidy = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * Quantity and unit price of a line from the three cells of the sheet (JUMLAH, BIAYA SATUAN, TOTAL BIAYA). The total
 * is what the sheet adds up, so it wins when the three disagree; a line with no figures at all is kept at 0.
 */
export function budgetOf(qty: number | null, unit: number | null, total: number | null, warn: (message: string) => void, label: string) {
  const sheetTotal = total ?? (qty !== null && unit !== null ? qty * unit : null);
  if (sheetTotal === null || sheetTotal <= 0) return { quantity: qty !== null && qty >= 0 ? Math.round(qty) : 1, unitPrice: 0 };
  const quantity = qty !== null && qty > 0 ? Math.round(qty) : 1;
  const unitPrice = Math.round(sheetTotal / quantity);
  if (unitPrice * quantity !== sheetTotal) warn(`${label}: ${sheetTotal} is not a whole multiple of ${quantity}; the line total is rounded to ${unitPrice * quantity}.`);
  return { quantity, unitPrice };
}
