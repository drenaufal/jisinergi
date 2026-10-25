import { asc, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  businessUnitMembers,
  finAssets,
  finBudgetItems,
  finCapital,
  finDividends,
  finExpenses,
  finMatchFees,
  finRegistrations,
  finStudentPayments,
  finStudents,
} from "@/lib/db/schema";
import { schoolFigures, unitFigures, type PaymentKind, type UnitDataset } from "./calc";
import type { UnitType } from "./unit-types";

/* Every list is for exactly one unit: pages never ask for "all units" rows. Only the owner dashboard
 * reads several units at once, through getAllUnitFigures at the bottom. */

export const listAssets = (unitId: string) =>
  db.select().from(finAssets).where(eq(finAssets.businessUnitId, unitId)).orderBy(asc(finAssets.purchasedOn), asc(finAssets.createdAt));

export const listCapital = (unitId: string) =>
  db.select().from(finCapital).where(eq(finCapital.businessUnitId, unitId)).orderBy(asc(finCapital.createdAt));

export const listDividends = (unitId: string) =>
  db.select().from(finDividends).where(eq(finDividends.businessUnitId, unitId)).orderBy(asc(finDividends.createdAt));

export const listRegistrations = (unitId: string) =>
  db.select().from(finRegistrations).where(eq(finRegistrations.businessUnitId, unitId)).orderBy(asc(finRegistrations.clubName));

export const listMatchFees = (unitId: string) =>
  db
    .select()
    .from(finMatchFees)
    .where(eq(finMatchFees.businessUnitId, unitId))
    .orderBy(asc(finMatchFees.week), asc(finMatchFees.createdAt));

export const listBudgetItems = (unitId: string) =>
  db
    .select()
    .from(finBudgetItems)
    .where(eq(finBudgetItems.businessUnitId, unitId))
    .orderBy(asc(finBudgetItems.period), asc(finBudgetItems.categoryOrder), asc(finBudgetItems.itemOrder), asc(finBudgetItems.createdAt));

/** Existing budget categories of a unit (to suggest names in the form). */
export const budgetCategories = (unitId: string) =>
  db
    .selectDistinct({ category: finBudgetItems.category, period: finBudgetItems.period, order: finBudgetItems.categoryOrder })
    .from(finBudgetItems)
    .where(eq(finBudgetItems.businessUnitId, unitId))
    .orderBy(asc(finBudgetItems.period), asc(finBudgetItems.categoryOrder));

export const listStudents = (unitId: string) =>
  db.select().from(finStudents).where(eq(finStudents.businessUnitId, unitId)).orderBy(asc(finStudents.name));

/** Payments with the student's name and jersey number, newest first. */
export const listStudentPayments = (unitId: string) =>
  db
    .select({ ...getTableColumns(finStudentPayments), studentName: finStudents.name, studentJersey: finStudents.jerseyNumber })
    .from(finStudentPayments)
    .innerJoin(finStudents, eq(finStudents.id, finStudentPayments.studentId))
    .where(eq(finStudentPayments.businessUnitId, unitId))
    .orderBy(desc(finStudentPayments.paidOn), desc(finStudentPayments.createdAt));

export const listExpenses = (unitId: string) =>
  db.select().from(finExpenses).where(eq(finExpenses.businessUnitId, unitId)).orderBy(desc(finExpenses.spentOn), desc(finExpenses.createdAt));

export async function expenseCategories(unitId: string) {
  const rows = await db
    .selectDistinct({ category: finExpenses.category })
    .from(finExpenses)
    .where(eq(finExpenses.businessUnitId, unitId))
    .orderBy(asc(finExpenses.category));
  return rows.map((r) => r.category);
}

/** Number of logins per unit (for the unit management table). */
export async function loginCountsByUnit() {
  const rows = await db
    .select({ unitId: businessUnitMembers.businessUnitId, n: sql<number>`count(*)` })
    .from(businessUnitMembers)
    .groupBy(businessUnitMembers.businessUnitId);
  return new Map(rows.map((r) => [r.unitId, Number(r.n)]));
}

/* ── Datasets for the summary pages ─────────────────────────────────── */

export async function ligaDataset(unitId: string, programWeeks: number): Promise<UnitDataset> {
  const [assets, capital, dividends, registrations, matchFees, budget] = await Promise.all([
    listAssets(unitId),
    listCapital(unitId),
    listDividends(unitId),
    listRegistrations(unitId),
    listMatchFees(unitId),
    listBudgetItems(unitId),
  ]);
  return { programWeeks, assets, capital, dividends, registrations, matchFees, budget };
}

export async function schoolDataset(unitId: string) {
  const [students, payments, expenses] = await Promise.all([listStudents(unitId), listStudentPayments(unitId), listExpenses(unitId)]);
  return { students, payments, expenses };
}

type UnitRef = { id: string; type: UnitType; programWeeks: number };

const empty = <T,>() => Promise.resolve([] as T[]);

/**
 * Figures of many units at once, for the owner dashboard. Each table is read a single time and split per
 * unit in memory, so ten units cost nine queries rather than ninety.
 */
export async function getAllUnitFigures(units: readonly UnitRef[]) {
  const ligaIds = units.filter((u) => u.type === "liga").map((u) => u.id);
  const schoolIds = units.filter((u) => u.type === "sekolah_bola").map((u) => u.id);

  const [assets, capital, dividends, registrations, matchFees, budget, students, payments, expenses] = await Promise.all([
    ligaIds.length ? db.select().from(finAssets).where(inArray(finAssets.businessUnitId, ligaIds)) : empty<typeof finAssets.$inferSelect>(),
    ligaIds.length ? db.select().from(finCapital).where(inArray(finCapital.businessUnitId, ligaIds)) : empty<typeof finCapital.$inferSelect>(),
    ligaIds.length ? db.select().from(finDividends).where(inArray(finDividends.businessUnitId, ligaIds)) : empty<typeof finDividends.$inferSelect>(),
    ligaIds.length ? db.select().from(finRegistrations).where(inArray(finRegistrations.businessUnitId, ligaIds)) : empty<typeof finRegistrations.$inferSelect>(),
    ligaIds.length ? db.select().from(finMatchFees).where(inArray(finMatchFees.businessUnitId, ligaIds)) : empty<typeof finMatchFees.$inferSelect>(),
    ligaIds.length ? db.select().from(finBudgetItems).where(inArray(finBudgetItems.businessUnitId, ligaIds)) : empty<typeof finBudgetItems.$inferSelect>(),
    schoolIds.length ? db.select().from(finStudents).where(inArray(finStudents.businessUnitId, schoolIds)) : empty<typeof finStudents.$inferSelect>(),
    schoolIds.length ? db.select().from(finStudentPayments).where(inArray(finStudentPayments.businessUnitId, schoolIds)) : empty<typeof finStudentPayments.$inferSelect>(),
    schoolIds.length ? db.select().from(finExpenses).where(inArray(finExpenses.businessUnitId, schoolIds)) : empty<typeof finExpenses.$inferSelect>(),
  ]);

  const mine = <T extends { businessUnitId: string }>(rows: T[], unitId: string) => rows.filter((r) => r.businessUnitId === unitId);

  type Liga = { type: "liga"; figures: ReturnType<typeof unitFigures>; dividend: number };
  type School = { type: "sekolah_bola"; figures: ReturnType<typeof schoolFigures>; dividend: number };
  const out = new Map<string, Liga | School>();

  for (const u of units) {
    if (u.type === "liga") {
      const figures = unitFigures({
        programWeeks: u.programWeeks,
        assets: mine(assets, u.id),
        capital: mine(capital, u.id),
        dividends: mine(dividends, u.id),
        registrations: mine(registrations, u.id),
        matchFees: mine(matchFees, u.id),
        budget: mine(budget, u.id),
      });
      out.set(u.id, { type: "liga", figures, dividend: figures.dividend.value });
    } else {
      const figures = schoolFigures({
        students: mine(students, u.id).length,
        payments: mine(payments, u.id).map((p) => ({ ...p, kind: p.kind as PaymentKind })),
        expenses: mine(expenses, u.id),
      });
      out.set(u.id, { type: "sekolah_bola", figures, dividend: figures.dividend });
    }
  }
  return out;
}
