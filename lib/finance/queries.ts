import { and, asc, desc, eq, getTableColumns, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  businessUnitMembers,
  finActualCosts,
  finActualItems,
  finAssets,
  finBudgetItems,
  finCapital,
  finExpenses,
  finMatchFees,
  finOtherIncome,
  finRegistrations,
  finStudentPayments,
  finStudents,
  finUnitOwners,
} from "@/lib/db/schema";
import { schoolFigures, unitFigures, type PaymentKind, type UnitDataset } from "./calc";
import type { UnitType } from "./unit-types";

/* Every list is for exactly one unit: pages never ask for "all units" rows. Only the owner dashboard
 * reads several units at once, through getAllUnitFigures at the bottom. */

export const listAssets = (unitId: string) =>
  db.select().from(finAssets).where(eq(finAssets.businessUnitId, unitId)).orderBy(asc(finAssets.purchasedOn), asc(finAssets.createdAt));

export const listCapital = (unitId: string) =>
  db.select().from(finCapital).where(eq(finCapital.businessUnitId, unitId)).orderBy(asc(finCapital.createdAt));

/** The owners of a unit and their dividend shares, in the order they were entered. */
export const listOwners = (unitId: string) =>
  db.select().from(finUnitOwners).where(eq(finUnitOwners.businessUnitId, unitId)).orderBy(asc(finUnitOwners.position), asc(finUnitOwners.createdAt));

export const listRegistrations = (unitId: string) =>
  db.select().from(finRegistrations).where(eq(finRegistrations.businessUnitId, unitId)).orderBy(asc(finRegistrations.ageGroup), asc(finRegistrations.clubName));

export const listMatchFees = (unitId: string) =>
  db
    .select()
    .from(finMatchFees)
    .where(eq(finMatchFees.businessUnitId, unitId))
    .orderBy(asc(finMatchFees.ageGroup), asc(finMatchFees.week), asc(finMatchFees.createdAt));

export const listOtherIncome = (unitId: string) =>
  db.select().from(finOtherIncome).where(eq(finOtherIncome.businessUnitId, unitId)).orderBy(asc(finOtherIncome.week), asc(finOtherIncome.createdAt));

export const listBudgetItems = (unitId: string) =>
  db
    .select()
    .from(finBudgetItems)
    .where(eq(finBudgetItems.businessUnitId, unitId))
    .orderBy(asc(finBudgetItems.period), asc(finBudgetItems.categoryOrder), asc(finBudgetItems.itemOrder), asc(finBudgetItems.createdAt));

/** Cost lines added on the RAB Actual page (they are not in the RAB), oldest first. */
export const listActualItems = (unitId: string) =>
  db.select().from(finActualItems).where(eq(finActualItems.businessUnitId, unitId)).orderBy(asc(finActualItems.createdAt));

/** Every real cost of a unit, oldest first. */
export const listActualCosts = (unitId: string) =>
  db.select().from(finActualCosts).where(eq(finActualCosts.businessUnitId, unitId)).orderBy(asc(finActualCosts.spentOn), asc(finActualCosts.createdAt));

/** Existing budget categories of a unit (to suggest names in the form). */
export const budgetCategories = (unitId: string) =>
  db
    .selectDistinct({ category: finBudgetItems.category, period: finBudgetItems.period, order: finBudgetItems.categoryOrder })
    .from(finBudgetItems)
    .where(eq(finBudgetItems.businessUnitId, unitId))
    .orderBy(asc(finBudgetItems.period), asc(finBudgetItems.categoryOrder));

export const listStudents = (unitId: string) =>
  db.select().from(finStudents).where(eq(finStudents.businessUnitId, unitId)).orderBy(asc(finStudents.name));

/**
 * Payments with the student's name and jersey number, newest first. Old `jersey` rows are left out:
 * jersey money is not income and is no longer recorded.
 */
export const listStudentPayments = (unitId: string) =>
  db
    .select({ ...getTableColumns(finStudentPayments), studentName: finStudents.name, studentJersey: finStudents.jerseyNumber })
    .from(finStudentPayments)
    .innerJoin(finStudents, eq(finStudents.id, finStudentPayments.studentId))
    .where(and(eq(finStudentPayments.businessUnitId, unitId), ne(finStudentPayments.kind, "jersey")))
    .orderBy(desc(finStudentPayments.paidOn), desc(finStudentPayments.createdAt))
    // the legacy kind was filtered out above, so what is left is one of the two kinds the app knows
    .then((rows) => rows.map((r) => ({ ...r, kind: r.kind as PaymentKind })));

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
  const [assets, capital, registrations, matchFees, otherIncome, budget] = await Promise.all([
    listAssets(unitId),
    listCapital(unitId),
    listRegistrations(unitId),
    listMatchFees(unitId),
    listOtherIncome(unitId),
    listBudgetItems(unitId),
  ]);
  return { programWeeks, assets, capital, registrations, matchFees, otherIncome, budget };
}

export async function schoolDataset(unitId: string) {
  const [students, payments, expenses, assets, capital] = await Promise.all([
    listStudents(unitId),
    listStudentPayments(unitId),
    listExpenses(unitId),
    listAssets(unitId),
    listCapital(unitId),
  ]);
  return { students, payments, expenses, assets, capital };
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

  const allIds = units.map((u) => u.id);
  const [assets, capital, registrations, matchFees, otherIncome, budget, students, payments, expenses] = await Promise.all([
    allIds.length ? db.select().from(finAssets).where(inArray(finAssets.businessUnitId, allIds)) : empty<typeof finAssets.$inferSelect>(),
    allIds.length ? db.select().from(finCapital).where(inArray(finCapital.businessUnitId, allIds)) : empty<typeof finCapital.$inferSelect>(),
    ligaIds.length ? db.select().from(finRegistrations).where(inArray(finRegistrations.businessUnitId, ligaIds)) : empty<typeof finRegistrations.$inferSelect>(),
    ligaIds.length ? db.select().from(finMatchFees).where(inArray(finMatchFees.businessUnitId, ligaIds)) : empty<typeof finMatchFees.$inferSelect>(),
    ligaIds.length ? db.select().from(finOtherIncome).where(inArray(finOtherIncome.businessUnitId, ligaIds)) : empty<typeof finOtherIncome.$inferSelect>(),
    ligaIds.length ? db.select().from(finBudgetItems).where(inArray(finBudgetItems.businessUnitId, ligaIds)) : empty<typeof finBudgetItems.$inferSelect>(),
    schoolIds.length ? db.select().from(finStudents).where(inArray(finStudents.businessUnitId, schoolIds)) : empty<typeof finStudents.$inferSelect>(),
    schoolIds.length
      ? db.select().from(finStudentPayments).where(and(inArray(finStudentPayments.businessUnitId, schoolIds), ne(finStudentPayments.kind, "jersey")))
      : empty<typeof finStudentPayments.$inferSelect>(),
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
        registrations: mine(registrations, u.id),
        matchFees: mine(matchFees, u.id),
        otherIncome: mine(otherIncome, u.id),
        budget: mine(budget, u.id),
      });
      out.set(u.id, { type: "liga", figures, dividend: figures.dividend.value });
    } else {
      const figures = schoolFigures({
        students: mine(students, u.id).length,
        payments: mine(payments, u.id).map((p) => ({ ...p, kind: p.kind as PaymentKind })),
        expenses: mine(expenses, u.id),
        assets: mine(assets, u.id),
        capital: mine(capital, u.id),
      });
      out.set(u.id, { type: "sekolah_bola", figures, dividend: figures.dividend });
    }
  }
  return out;
}
