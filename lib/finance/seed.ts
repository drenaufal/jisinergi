import { eq } from "drizzle-orm";
import type { AnyMySqlColumn, MySqlTable } from "drizzle-orm/mysql-core";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { hash } from "bcryptjs";
import * as s from "@/lib/db/schema";
import { SEED_ASSETS, SEED_BUDGET, SEED_CAPITAL, SEED_DIVIDENDS, SEED_MATCH_FEES, SEED_REGISTRATIONS } from "./seed-data";
import {
  DEMO_EXPENSES,
  DEMO_JERSEY_PRICE,
  DEMO_MONTHLY_DISCOUNT,
  DEMO_MONTHLY_FEE,
  DEMO_MONTHLY_PAID,
  DEMO_REGISTRATION_DISCOUNT,
  DEMO_REGISTRATION_FEE,
  DEMO_STUDENTS,
} from "./demo-school";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = MySql2Database<any>;

/** Every ledger table has a primary key and the unit it belongs to. */
type LedgerTable = MySqlTable & { id: AnyMySqlColumn; businessUnitId: AnyMySqlColumn };

export const DEMO_LIGA = { code: "LIGA-DEMO", name: "Liga Demo", type: "liga" as const, description: "Data contoh dari workbook Buku-besar" };
export const DEMO_SCHOOL = { code: "SB-DEMO", name: "Sekolah Bola Demo", type: "sekolah_bola" as const, description: "Data contoh (bukan data asli)" };
export const DEMO_LOGINS = [
  { unit: DEMO_LIGA.code, email: "admin.liga@footgrit.test", name: "Admin Liga Demo" },
  { unit: DEMO_SCHOOL.code, email: "admin.sekolah@footgrit.test", name: "Admin Sekolah Bola Demo" },
] as const;

export type DemoSeedOptions = {
  /** Report what would happen, write nothing. */
  dryRun?: boolean;
  /** Replace the demo units' rows with the demo data again. */
  reset?: boolean;
  /** When set, also creates one Admin Unit login per demo unit with this password. */
  accountPassword?: string;
};

export type DemoSeedReport = {
  dryRun: boolean;
  units: { code: string; created: boolean }[];
  tables: { table: string; unit: string; action: "inserted" | "replaced" | "skipped"; rows: number; existing: number }[];
  accounts: { email: string; unit: string; created: boolean }[];
};

/**
 * Loads demo data: a Liga unit (the six original workbooks) and a Sekolah Bola unit (invented).
 * Additive and re-runnable: a table that already holds rows for a unit is left alone, so data typed in
 * by hand is never overwritten. `reset` replaces just the demo units' rows. No other table is touched.
 */
export async function seedDemo(db: AnyDb, options: DemoSeedOptions = {}): Promise<DemoSeedReport> {
  const dryRun = !!options.dryRun;
  const report: DemoSeedReport = { dryRun, units: [], tables: [], accounts: [] };

  /* ── units ── */
  const idByCode = new Map<string, string>();
  const createdNow = new Set<string>();
  for (const unit of [DEMO_LIGA, DEMO_SCHOOL]) {
    const [found] = await db.select({ id: s.businessUnits.id }).from(s.businessUnits).where(eq(s.businessUnits.code, unit.code));
    const id = found?.id ?? crypto.randomUUID();
    if (!found) {
      createdNow.add(unit.code);
      if (!dryRun) await db.insert(s.businessUnits).values({ id, ...unit, programWeeks: 10 });
    }
    idByCode.set(unit.code, id);
    report.units.push({ code: unit.code, created: !found });
  }

  /* ── ledger tables ── */
  async function load(name: string, code: string, table: LedgerTable, rows: object[]) {
    const id = idByCode.get(code)!;
    const col = table.businessUnitId;
    const existing = createdNow.has(code) ? [] : await db.select({ id: table.id }).from(table).where(eq(col, id));
    if (existing.length && !options.reset) {
      report.tables.push({ table: name, unit: code, action: "skipped", rows: 0, existing: existing.length });
      return;
    }
    if (!dryRun) {
      if (existing.length) await db.delete(table).where(eq(col, id));
      if (rows.length) await db.insert(table).values(rows.map((row) => ({ id: crypto.randomUUID(), businessUnitId: id, ...row })) as never);
    }
    report.tables.push({ table: name, unit: code, action: existing.length ? "replaced" : "inserted", rows: rows.length, existing: existing.length });
  }

  const liga = DEMO_LIGA.code;
  await load("fin_assets", liga, s.finAssets, SEED_ASSETS.map((r) => ({ purchasedOn: r.purchasedOn, name: r.name, amount: r.amount })));
  await load("fin_capital", liga, s.finCapital, SEED_CAPITAL.map((r) => ({ ownerName: r.owner, amount: r.amount, status: r.status })));
  await load("fin_dividends", liga, s.finDividends, SEED_DIVIDENDS.map((r) => ({ recipientName: r.recipient, amount: r.amount })));
  await load("fin_registrations", liga, s.finRegistrations, SEED_REGISTRATIONS.map((r) => ({ clubName: r.club, fee: r.fee, dpAmount: r.dp, finalAmount: r.final })));
  await load("fin_match_fees", liga, s.finMatchFees, SEED_MATCH_FEES.map((r) => ({ clubName: r.club, week: r.week, matches: r.matches, feePerMatch: r.fee })));
  await load(
    "fin_budget_items",
    liga,
    s.finBudgetItems,
    SEED_BUDGET.map((r) => ({
      period: r.period,
      category: r.category,
      categoryOrder: r.categoryOrder,
      name: r.name,
      itemOrder: r.itemOrder,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
    })),
  );

  /* ── Sekolah Bola: students first (payments refer to them) ── */
  const school = DEMO_SCHOOL.code;
  const schoolId = idByCode.get(school)!;
  const studentIds = DEMO_STUDENTS.map(() => crypto.randomUUID());
  const hasStudents = createdNow.has(school) ? [] : await db.select({ id: s.finStudents.id }).from(s.finStudents).where(eq(s.finStudents.businessUnitId, schoolId));
  const replaceSchool = options.reset && hasStudents.length > 0;
  if (hasStudents.length && !options.reset) {
    report.tables.push({ table: "fin_students", unit: school, action: "skipped", rows: 0, existing: hasStudents.length });
    report.tables.push({ table: "fin_student_payments", unit: school, action: "skipped", rows: 0, existing: 0 });
  } else {
    const payments = DEMO_STUDENTS.flatMap((student, i) => {
      const base = { studentId: studentIds[i], businessUnitId: schoolId };
      const rows: object[] = [
        { ...base, kind: "registration", paidOn: student.joinedOn, amount: DEMO_REGISTRATION_FEE - (DEMO_REGISTRATION_DISCOUNT[i] ?? 0), discount: DEMO_REGISTRATION_DISCOUNT[i] ?? 0, period: null },
        { ...base, kind: "jersey", paidOn: student.joinedOn, amount: DEMO_JERSEY_PRICE, discount: 0, period: null },
      ];
      for (const period of DEMO_MONTHLY_PAID[i]) {
        rows.push({
          ...base,
          kind: "monthly",
          paidOn: `${period}-05`,
          amount: DEMO_MONTHLY_FEE - (DEMO_MONTHLY_DISCOUNT[i] ?? 0),
          discount: DEMO_MONTHLY_DISCOUNT[i] ?? 0,
          period,
        });
      }
      return rows;
    });
    if (!dryRun) {
      if (replaceSchool) {
        await db.delete(s.finStudents).where(eq(s.finStudents.businessUnitId, schoolId)); // payments go with them (cascade)
      }
      await db.insert(s.finStudents).values(
        DEMO_STUDENTS.map((st, i) => ({ id: studentIds[i], businessUnitId: schoolId, name: st.name, nickname: st.nickname, joinedOn: st.joinedOn, birthDate: st.birthDate, jerseyNumber: st.jerseyNumber })),
      );
      await db.insert(s.finStudentPayments).values(payments.map((p) => ({ id: crypto.randomUUID(), ...p })) as never);
    }
    report.tables.push({ table: "fin_students", unit: school, action: replaceSchool ? "replaced" : "inserted", rows: DEMO_STUDENTS.length, existing: hasStudents.length });
    report.tables.push({ table: "fin_student_payments", unit: school, action: replaceSchool ? "replaced" : "inserted", rows: payments.length, existing: 0 });
  }
  await load("fin_expenses", school, s.finExpenses, DEMO_EXPENSES.map((e) => ({ spentOn: e.spentOn, category: e.category, name: e.name, amount: e.amount })));

  /* ── logins (only when a password is supplied) ── */
  if (options.accountPassword) {
    const passwordHash = dryRun ? "" : await hash(options.accountPassword, 10);
    for (const login of DEMO_LOGINS) {
      const [found] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, login.email));
      if (!found && !dryRun) {
        const id = crypto.randomUUID();
        await db.insert(s.users).values({ id, name: login.name, email: login.email, passwordHash, role: "unit_admin", title: login.name, active: true });
        await db.insert(s.businessUnitMembers).values({ userId: id, businessUnitId: idByCode.get(login.unit)! });
      }
      report.accounts.push({ email: login.email, unit: login.unit, created: !found });
    }
  }
  return report;
}
