import { and, eq, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as s from "@/lib/db/schema";
import { mediaIdFromUrl } from "@/lib/media";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = MySql2Database<any>;

export type RemoveUnitReport = {
  code: string;
  found: boolean;
  rows: Record<string, number>;
  logins: number;
  receipts: number;
};

/**
 * Deletes one business unit with everything under it: every ledger row, the Admin Unit logins that belong
 * only to it, and the receipts they point at. There is no undo — take a backup first.
 * Used by `npm run db:seed:demo -- --remove` and by tests; the app itself never deletes a unit.
 */
export async function removeUnit(db: AnyDb, code: string, options: { dryRun?: boolean } = {}): Promise<RemoveUnitReport> {
  const [unit] = await db.select({ id: s.businessUnits.id }).from(s.businessUnits).where(eq(s.businessUnits.code, code));
  const report: RemoveUnitReport = { code, found: !!unit, rows: {}, logins: 0, receipts: 0 };
  if (!unit) return report;
  const unitId = unit.id;

  const tables = [
    ["fin_student_payments", s.finStudentPayments],
    ["fin_students", s.finStudents],
    ["fin_expenses", s.finExpenses],
    ["fin_assets", s.finAssets],
    ["fin_capital", s.finCapital],
    ["fin_dividends", s.finDividends],
    ["fin_registrations", s.finRegistrations],
    ["fin_match_fees", s.finMatchFees],
    ["fin_budget_items", s.finBudgetItems],
  ] as const;

  // receipts referenced by the unit's rows
  const urls = new Set<string>();
  const add = (v: string | null | undefined) => {
    const id = mediaIdFromUrl(v);
    if (id) urls.add(id);
  };
  for (const r of await db.select({ u: s.finAssets.proofUrl }).from(s.finAssets).where(eq(s.finAssets.businessUnitId, unitId))) add(r.u);
  for (const r of await db.select({ a: s.finRegistrations.dpProofUrl, b: s.finRegistrations.finalProofUrl }).from(s.finRegistrations).where(eq(s.finRegistrations.businessUnitId, unitId))) {
    add(r.a);
    add(r.b);
  }
  for (const r of await db.select({ u: s.finMatchFees.proofUrl }).from(s.finMatchFees).where(eq(s.finMatchFees.businessUnitId, unitId))) add(r.u);
  for (const r of await db.select({ u: s.finStudentPayments.proofUrl }).from(s.finStudentPayments).where(eq(s.finStudentPayments.businessUnitId, unitId))) add(r.u);
  for (const r of await db.select({ u: s.finExpenses.proofUrl }).from(s.finExpenses).where(eq(s.finExpenses.businessUnitId, unitId))) add(r.u);

  const members = await db.select({ userId: s.businessUnitMembers.userId }).from(s.businessUnitMembers).where(eq(s.businessUnitMembers.businessUnitId, unitId));
  report.logins = members.length;
  report.receipts = urls.size;

  for (const [name, table] of tables) {
    const rows = await db.select({ id: table.id }).from(table).where(eq(table.businessUnitId, unitId));
    report.rows[name] = rows.length;
  }
  if (options.dryRun) return report;

  await db.transaction(async (tx) => {
    for (const [, table] of tables) await tx.delete(table).where(eq(table.businessUnitId, unitId));
    await tx.delete(s.businessUnitMembers).where(eq(s.businessUnitMembers.businessUnitId, unitId));
    const ids = members.map((m) => m.userId);
    // only Admin Unit accounts go with the unit; an owner could never be a member, but be explicit
    if (ids.length) await tx.delete(s.users).where(and(inArray(s.users.id, ids), eq(s.users.role, "unit_admin")));
    await tx.delete(s.businessUnits).where(eq(s.businessUnits.id, unitId));
    if (urls.size) await tx.delete(s.media).where(inArray(s.media.id, [...urls]));
  });
  return report;
}
