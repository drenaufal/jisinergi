/**
 * Keuangan rules that need no database: the seed against the totals Excel computed in the original
 * workbooks, the arithmetic behind every table, input validation and who may see which unit.
 * Run with `npm run test:finance`.
 */
import {
  budgetByCategory,
  budgetLineProgramTotal,
  budgetLineTotal,
  budgetTotals,
  buildActualGrid,
  capitalSummary,
  coveredMonth,
  cumulativeByDate,
  groupBudget,
  matchFeeAmount,
  matchFeeByWeek,
  playedWeeks,
  registrationPaid,
  registrationRemaining,
  registrationStatus,
  sum,
  unitFigures,
  expenseByCategory,
  incomeByKind,
  incomeMonthsByKind,
  ligaDividend,
  mondayOf,
  monthOf,
  ownerDividend,
  schoolFigures,
  schoolMonthly,
  studentStatus,
  programStart,
  weekNumber,
  weekStartDate,
  weeklyVariance,
  type PaymentAmounts,
  type UnitDataset,
} from "@/lib/finance/calc";
import { BP_TOTAL, bpToField, equalShares, ownersSchema, percentToBp, readOwnerRows, splitByShares } from "@/lib/finance/ownership";
import { DIVIDEND_TARGET } from "@/lib/finance/config";
import { currentMonth } from "@/lib/finance/period";
import { UNIT_KINDS } from "@/lib/finance/unit-types";
import {
  ENTITIES,
  actualCostSchema,
  actualItemSchema,
  assetSchema,
  budgetSchema,
  capitalSchema,
  expenseSchema,
  matchFeeSchema,
  otherIncomeSchema,
  paymentSchema,
  studentSchema,
  moneyField,
  registrationSchema,
} from "@/lib/finance/entities";
import { makeEditUnitSchema, makeNewLoginSchema, makeNewUnitSchema } from "@/lib/finance/unit-schemas";
import {
  EXCEL_CONTROL_TOTALS as X,
  SEED_ASSETS,
  SEED_BUDGET,
  SEED_CAPITAL,
  SEED_DIVIDENDS,
  SEED_MATCH_FEES,
  SEED_REGISTRATIONS,
} from "@/lib/finance/seed-data";
import {
  DEMO_EXPENSES,
  DEMO_MONTHLY_DISCOUNT,
  DEMO_MONTHLY_FEE,
  DEMO_MONTHLY_PAID,
  DEMO_OWNERS,
  DEMO_REGISTRATION_DISCOUNT,
  DEMO_REGISTRATION_FEE,
  DEMO_STUDENTS,
} from "@/lib/finance/demo-school";
import { createT } from "@/lib/i18n/translate";
import { makeFormatters } from "@/lib/i18n/format";

let failures = 0;
const ok = (cond: unknown, label: string) => {
  if (!cond) failures++;
  console.log(`${cond ? "✓" : "✗"} ${label}`);
};
const eq = (actual: unknown, expected: unknown, label: string) => {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  if (!same) console.log(`   expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  ok(same, label);
};

const t = createT("id");
const registrations = SEED_REGISTRATIONS.map((r) => ({ clubName: r.club, fee: r.fee, dpAmount: r.dp, finalAmount: r.final }));
const matchFees = SEED_MATCH_FEES.map((m) => ({ clubName: m.club, week: m.week, matches: m.matches, feePerMatch: m.fee }));

/* ── The seed reproduces the workbooks ── */
eq(sum(SEED_ASSETS, (a) => a.amount), X.assetsTotal, "ASET: total matches the workbook (5.3 jt)");
eq(sum(SEED_CAPITAL, (c) => c.amount), X.capitalTotal, "MODAL: total matches the workbook (60 jt)");
eq(sum(SEED_DIVIDENDS, (d) => d.amount), X.dividendTotal, "DEVIDEN: total matches the workbook cell B4 (100 jt)");
eq(sum(registrations, (r) => r.fee), X.registrationFee, "REGISTRASI: billed total matches cell C1 (17.5 jt)");
eq(sum(matchFees, (m) => m.matches), X.matchFeeMatches, "MATCH FEE: total matches matches cell AH1 (52)");
eq(sum(matchFees, matchFeeAmount), X.matchFeeAmount, "MATCH FEE: total amount matches cell AI1 (26 jt)");
const totals = budgetTotals(SEED_BUDGET, 10);
eq(totals.weeklyPerWeek, X.rabWeeklyPerWeek, "RAB: weekly per week matches cell E51");
eq(totals.weeklyProgram, X.rabWeeklyAll, "RAB: weekly × 10 weeks matches cell E52");
eq(totals.monthly, X.rabMonthly, "RAB: monthly total matches cell E92");
eq(totals.total, X.rabTotal, "RAB: total estimate matches cell E94 (265.2 jt)");

const weekly = groupBudget(SEED_BUDGET).weekly;
const monthly = groupBudget(SEED_BUDGET).monthly;
eq(weekly.length, 7, "RAB: seven weekly categories");
eq(monthly.length, 6, "RAB: six monthly categories");
eq(weekly.map((g) => g.subtotal), [4686000, 1400000, 10400000, 1700000, 400000, 1500000, 2530000], "RAB: weekly category subtotals match cells E4…E47");
eq(monthly.map((g) => g.subtotal), [5800000, 1640000, 28100000, 2000000, 1500000, 0], "RAB: monthly category subtotals match cells E57…E90");
eq(weekly.map((g) => g.category)[0], "Biaya Peralatan & Sarana Pertandingan", "RAB: categories keep the workbook order");
ok(SEED_BUDGET.every((b) => Number.isInteger(b.unitPrice) && b.unitPrice >= 0 && b.quantity >= 0), "RAB: every quantity and unit price is a whole, non-negative number");
ok(SEED_BUDGET.filter((b) => budgetLineTotal(b) === 0).length === 5, "RAB: the five zero-value lines (TV, gawang, tandu, keamanan, liputan) are kept");
ok(!SEED_BUDGET.some((b) => /@\s*\d/.test(b.name)), "RAB: no “@price” left in item names (unit price has its own column)");
eq(budgetByCategory(SEED_BUDGET, 10)[0], { category: "Biaya Panitia", period: "weekly", amount: 104000000 }, "RAB: biggest category over the program = Biaya Panitia (10.4 jt × 10)");

/* ── Seed structure ── */
eq(new Set(matchFees.map((m) => `${m.clubName}|${m.week}`)).size, matchFees.length, "MATCH FEE: no club has two rows for the same week");
eq(new Set(registrations.map((r) => r.clubName.toLowerCase())).size, registrations.length, "REGISTRASI: club names are unique");

/* ── Registrasi ── */
ok(registrations.every((r) => registrationStatus(r) === "partial"), "REGISTRASI: all ten clubs have paid only the DP → “belum lunas”");
eq(sum(registrations, registrationPaid), 7500000, "REGISTRASI: 7.5 jt received (10 × 750 rb DP)");
eq(sum(registrations, registrationRemaining), 10000000, "REGISTRASI: 10 jt still to collect");
eq(registrationStatus({ fee: 1750000, dpAmount: 750000, finalAmount: 1000000 }), "paid", "REGISTRASI: DP + final = fee → lunas");
eq(registrationStatus({ fee: 1750000, dpAmount: 0, finalAmount: 0 }), "unpaid", "REGISTRASI: nothing paid → belum bayar");
eq(registrationRemaining({ fee: 100, dpAmount: 80, finalAmount: 40 }), 0, "REGISTRASI: remaining never goes negative");

/* ── Match fee ── */
const weeks = matchFeeByWeek(matchFees, 10);
eq(weeks.length, 10, "MATCH FEE: ten weekly columns");
eq(weeks.slice(0, 3).map((w) => [w.matches, w.amount]), [[18, 9000000], [16, 8000000], [18, 9000000]], "MATCH FEE: weeks 1–3 match the workbook totals (D1/G1/J1, E1/H1/K1)");
ok(weeks.slice(3).every((w) => w.matches === 0 && w.amount === 0), "MATCH FEE: weeks 4–10 are empty, not missing");
eq(playedWeeks(matchFees), 3, "MATCH FEE: three weeks played");
eq(matchFeeByWeek([{ week: 12, matches: 1, feePerMatch: 5 }], 10).length, 12, "MATCH FEE: a week beyond the program still gets its column");

/* ── Modal, dividen, aset ── */
const cap = capitalSummary(SEED_CAPITAL);
eq([cap.total, cap.returned, cap.outstanding], [60000000, 50000000, 10000000], "MODAL: 50 jt returned, 10 jt outstanding");
ok(Math.abs(cap.returnedShare - 50 / 60) < 1e-9, "MODAL: 83.3% returned");
eq(SEED_DIVIDENDS.map((d) => Math.round((d.amount / X.dividendTotal) * BP_TOTAL)), [7000, 3000], "KEPEMILIKAN: the workbook dividend split (70% / 30%) becomes the owners' shares");
eq(cumulativeByDate(SEED_ASSETS).map((p) => p.cumulative), [1000000, 3900000, 4800000, 5300000], "ASET: running total by purchase date");
eq(cumulativeByDate(SEED_ASSETS).map((p) => p.date), ["2026-10-04", "2026-10-07", "2026-10-13", "2026-10-14"], "ASET: two purchases on 7 Oct share one point");

/* ── Liga summary figures and the Liga dividend formula ── */
const ligaData: UnitDataset = {
  programWeeks: 10,
  assets: SEED_ASSETS.map((a) => ({ amount: a.amount, proofUrl: null })),
  capital: SEED_CAPITAL,
  registrations,
  matchFees,
  budget: SEED_BUDGET,
};
const liga = unitFigures(ligaData);
eq([liga.capital.total, liga.assets.total, liga.income, liga.budget.total], [60000000, 5300000, 33500000, 265200000], "Liga summary equals the workbook totals");
ok(Math.abs(liga.budgetCoverage - 33500000 / 265200000) < 1e-12, "Liga: income covers 12.6% of the budget");
eq(unitFigures({ ...ligaData, budget: [] }).budgetCoverage, 0, "no budget → coverage 0, not NaN");

// Dividen (Liga) = RAB − (modal + registrasi + match fee)
eq(liga.dividend, { budget: 265200000, capital: 60000000, registration: 7500000, matchFee: 26000000, funding: 93500000, value: 171700000 }, "DIVIDEN LIGA: 265,2 jt − (60 jt + 7,5 jt + 26 jt) = 171,7 jt");
eq(ligaDividend({ budget: 100, capital: 30, registration: 20, matchFee: 10 }).value, 40, "DIVIDEN LIGA: 100 − (30 + 20 + 10) = 40");
eq(ligaDividend({ budget: 50, capital: 30, registration: 20, matchFee: 10 }).value, -10, "DIVIDEN LIGA: may be negative when funding exceeds the RAB");
eq(ligaDividend({ budget: 0, capital: 0, registration: 0, matchFee: 0 }).value, 0, "DIVIDEN LIGA: an empty unit is 0");

/* ── Sekolah Bola ── */
const pay = (studentId: string, kind: PaymentAmounts["kind"], paidOn: string, amount: number, discount = 0, period: string | null = null): PaymentAmounts => ({ studentId, kind, paidOn, amount, discount, period });
// a registration already includes the fee of the month it is paid in, so it carries that month as its period
const payments: PaymentAmounts[] = [
  pay("a", "registration", "2026-08-03", 400000, 100000, "2026-08"),
  pay("a", "monthly", "2026-09-05", 150000, 50000, "2026-09"),
  pay("b", "registration", "2026-09-01", 500000, 0, "2026-09"),
  pay("b", "monthly", "2026-10-06", 200000, 0, "2026-10"),
];
const expenses = [
  { spentOn: "2026-08-02", category: "Sewa lapangan", amount: 600000 },
  { spentOn: "2026-08-20", category: "Perlengkapan", amount: 100000 },
  { spentOn: "2026-09-02", category: "Sewa lapangan", amount: 600000 },
  { spentOn: "2026-10-02", category: "Sewa lapangan", amount: 600000 },
];
eq(incomeByKind(payments), { registration: 900000, monthly: 350000, total: 1250000, discounts: 150000 }, "PEMASUKAN: registration + monthly only (jersey money is not income); discounts are not money received");
eq(monthOf("2026-03-14"), "2026-03", "month of a date");
eq(schoolMonthly(payments, expenses), [
  { month: "2026-08", income: 400000, expense: 700000, dividend: -300000 },
  { month: "2026-09", income: 650000, expense: 600000, dividend: 50000 },
  { month: "2026-10", income: 200000, expense: 600000, dividend: -400000 },
], "SISA SALDO SEKOLAH BOLA per bulan = pemasukan − pengeluaran (a month that spends more than it earns is negative)");
const school = schoolFigures({ students: 2, payments, expenses });
eq([school.income.total, school.expense, school.dividend], [1250000, 1900000, -650000], "SEKOLAH BOLA: accumulated sisa saldo = Σ monthly = total pemasukan − total pengeluaran");
const schoolFull = schoolFigures({ students: 2, payments, expenses, assets: [{ amount: 750000 }, { amount: 120000 }], capital: [{ amount: 15000000, status: "outstanding" }, { amount: 10000000, status: "returned" }] });
eq([schoolFull.assets, schoolFull.capital.total, schoolFull.capital.outstanding, schoolFull.capital.count], [{ total: 870000, count: 2 }, 25000000, 15000000, 2], "SEKOLAH BOLA: assets and modal add up");
eq(schoolFull.dividend, school.dividend, "SEKOLAH BOLA: the sisa saldo ignores modal and assets");
eq(sum(school.months, (m) => m.dividend), school.dividend, "the months add up to the accumulated dividend");
eq(schoolFigures({ students: 0, payments: [], expenses: [] }).months, [], "an empty school has no months");
eq(incomeMonthsByKind(payments).map((m) => [m.month, m.registration, m.monthly]), [["2026-08", 400000, 0], ["2026-09", 500000, 150000], ["2026-10", 0, 200000]], "income per month split by kind");
eq(expenseByCategory(expenses), [{ category: "Sewa lapangan", amount: 1800000 }, { category: "Perlengkapan", amount: 100000 }], "expenses grouped by category, biggest first");
const st = studentStatus(payments, "a", "2026-09");
eq([st.registered, st.paidThisMonth, st.lastMonthly, st.totalPaid, st.totalDiscount], [true, true, "2026-09", 550000, 150000], "student status: registered, this month paid, totals");
eq(studentStatus(payments, "b", "2026-09").paidThisMonth, true, "student status: the registration covers the month it was paid in (no separate monthly fee)");
eq(studentStatus(payments, "a", "2026-08").paidThisMonth, true, "student status: August is paid through the registration");
eq(studentStatus(payments, "b", "2026-11").paidThisMonth, false, "student status: has not paid this month");
eq(studentStatus(payments, "zzz", "2026-09"), { registered: false, paidThisMonth: false, lastMonthly: null, totalPaid: 0, totalDiscount: 0 }, "student status: unknown student has nothing");
eq([coveredMonth({ kind: "registration", paidOn: "2026-08-31", period: null }), coveredMonth({ kind: "registration", paidOn: "2026-08-31", period: "2026-09" }), coveredMonth({ kind: "monthly", paidOn: "2026-08-31", period: "2026-09" })], ["2026-08", "2026-09", "2026-09"], "covered month: an old registration (no period) covers the month it was paid in");
ok(/^\d{4}-\d{2}$/.test(currentMonth()), "current month is YYYY-MM");

/* ── The demo seed is internally consistent ── */
const demoRegs = DEMO_STUDENTS.map((_, i) => DEMO_REGISTRATION_FEE - (DEMO_REGISTRATION_DISCOUNT[i] ?? 0));
ok(demoRegs.every((v) => v > 0), "demo: registration fee after discount stays positive");
ok(DEMO_MONTHLY_PAID.length === DEMO_STUDENTS.length, "demo: every student has a monthly-payment list");
ok(DEMO_MONTHLY_PAID.every((months) => new Set(months).size === months.length), "demo: no student pays the same month twice (unique index)");
ok(DEMO_MONTHLY_FEE > Math.max(0, ...Object.values(DEMO_MONTHLY_DISCOUNT)), "demo: discounts are smaller than the fee");
eq(DEMO_OWNERS.reduce((a, o) => a + o.shareBp, 0), BP_TOTAL, "demo: the school owners' shares total 100%");
ok(DEMO_EXPENSES.some((e) => e.isAsset), "demo: at least one expense is an asset");
ok(new Set(DEMO_STUDENTS.map((d) => d.jerseyNumber)).size === DEMO_STUDENTS.length, "demo: jersey numbers are unique");
ok(DEMO_EXPENSES.every((e) => e.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(e.spentOn)), "demo: expenses have a positive amount and a date");

/* ── Owner: accumulated dividend vs the 3 miliar target ── */
eq(DIVIDEND_TARGET, 3_000_000_000, "the target is Rp 3.000.000.000 (3 M)");
eq(ownerDividend({ liga: 1_000_000_000, sekolahBola: 500_000_000, target: DIVIDEND_TARGET }), { liga: 1_000_000_000, sekolahBola: 500_000_000, target: 3_000_000_000, accumulated: 1_500_000_000, progress: 0.5, remaining: 1_500_000_000 }, "OWNER: Liga + Sekolah Bola accumulate toward the target (50%)");
eq(ownerDividend({ liga: 2_500_000_000, sekolahBola: 1_000_000_000, target: DIVIDEND_TARGET }).remaining, 0, "OWNER: nothing remains once the target is passed");
ok(ownerDividend({ liga: 2_500_000_000, sekolahBola: 1_000_000_000, target: DIVIDEND_TARGET }).progress > 1, "OWNER: progress may exceed 100%");
eq(ownerDividend({ liga: 100, sekolahBola: -300, target: DIVIDEND_TARGET }).progress, 0, "OWNER: a negative accumulation counts as 0% progress, not negative");
eq(ownerDividend({ liga: 0, sekolahBola: 0, target: DIVIDEND_TARGET }).remaining, DIVIDEND_TARGET, "OWNER: with nothing yet, the whole target remains");
eq(ownerDividend({ liga: liga.dividend.value, sekolahBola: school.dividend, target: DIVIDEND_TARGET }).accumulated, 171700000 - 650000, "OWNER: the accumulated figure is the Liga formula plus the school dividend");

/* ── Input validation ── */
const date = "2026-10-22";
ok(assetSchema(t).safeParse({ purchasedOn: date, name: "Sound Sistem", amount: "2000000", proofUrl: "", note: "" }).success, "asset: plain digits are accepted");
eq((assetSchema(t).parse({ purchasedOn: date, name: "X", amount: "Rp 2.000.000", proofUrl: "", note: "" }) as { amount: number }).amount, 2000000, "asset: “Rp 2.000.000” is read as 2000000");
ok(!assetSchema(t).safeParse({ purchasedOn: date, name: "X", amount: "", proofUrl: "", note: "" }).success, "asset: amount is required");
ok(!assetSchema(t).safeParse({ purchasedOn: date, name: "X", amount: "99999999999999", proofUrl: "", note: "" }).success, "asset: an absurd amount is refused");
ok(!assetSchema(t).safeParse({ purchasedOn: "2026-02-31", name: "X", amount: "1", proofUrl: "", note: "" }).success, "asset: 31 February is not a date");
ok(!assetSchema(t).safeParse({ purchasedOn: date, name: "  ", amount: "1", proofUrl: "", note: "" }).success, "asset: a blank name is refused");
ok(!assetSchema(t).safeParse({ purchasedOn: date, name: "X", amount: "1", proofUrl: "https://evil.example/x.png", note: "" }).success, "asset: a receipt must be one of our own uploads, not an arbitrary URL");
ok(moneyField(t).safeParse("0").success, "money: zero is allowed (a zero-value budget line)");
ok(capitalSchema(t).safeParse({ ownerName: "A", amount: "50000000", status: "returned", investedOn: "", returnedOn: "", note: "" }).success, "capital: optional dates may be empty");
ok(!capitalSchema(t).safeParse({ ownerName: "A", amount: "1", status: "gone", investedOn: "", returnedOn: "", note: "" }).success, "capital: unknown status refused");
const reg = (dp: string, fin: string) => registrationSchema(t).safeParse({ clubName: "CYSSS", fee: "1750000", dpAmount: dp, finalAmount: fin, dpPaidOn: "", finalPaidOn: "", dpProofUrl: "", finalProofUrl: "", note: "" });
ok(reg("750000", "").success, "registration: DP only (final left blank = 0)");
ok(reg("750000", "1000000").success, "registration: DP + final = fee");
ok(!reg("750000", "1000001").success, "registration: paying more than the fee is refused");
const mf = (week: string, matches: string) => matchFeeSchema(t).safeParse({ clubName: "Maesa", week, matches, feePerMatch: "500000", proofUrl: "", note: "" });
ok(mf("1", "2").success && mf("52", "0").success, "match fee: week 1–52, 0 or more matches");
ok(!mf("0", "2").success && !mf("53", "2").success && !mf("1", "-1").success && !mf("1.5", "2").success, "match fee: week and matches out of range are refused");
ok(budgetSchema(t).safeParse({ period: "monthly", category: "Biaya Hadiah", name: "Medali", quantity: "160", unitPrice: "35000", note: "" }).success, "budget: a normal line");
ok(!budgetSchema(t).safeParse({ period: "yearly", category: "x", name: "y", quantity: "1", unitPrice: "1", note: "" }).success, "budget: only weekly / monthly");
ok(Object.keys(ENTITIES).length === 11, "eleven kinds of data");
ok(Object.keys(ENTITIES).every((k) => [...UNIT_KINDS.liga, ...UNIT_KINDS.sekolah_bola].includes(k)), "every kind of data is assigned to a unit type");
ok(studentSchema(t).safeParse({ name: "Anak Contoh", nickname: "", joinedOn: date, birthDate: "", jerseyNumber: "", note: "" }).success, "student: nickname, birth date and jersey number are optional");
ok(!studentSchema(t).safeParse({ name: "", joinedOn: date, jerseyNumber: "7" }).success, "student: a name is required");
ok(!studentSchema(t).safeParse({ name: "X", joinedOn: date, jerseyNumber: "1000" }).success && !studentSchema(t).safeParse({ name: "X", joinedOn: date, jerseyNumber: "-1" }).success, "student: jersey number 0–999");
ok(!studentSchema(t).safeParse({ name: "X", joinedOn: "" }).success, "student: the join date is required");
const pm = (o: Record<string, string>) => paymentSchema(t).safeParse({ studentId: "s1", kind: "monthly", paidOn: date, amount: "200000", discount: "", period: "2026-10", proofUrl: "", note: "", ...o });
ok(pm({}).success, "payment: a monthly fee with its month");
ok(!pm({ period: "" }).success && !pm({ period: "2026-13" }).success && !pm({ period: "Oktober" }).success, "payment: a monthly fee needs a real month");
ok(pm({ kind: "registration", period: "" }).success, "payment: registration needs no month");
eq((pm({ kind: "registration", period: "2026-01", paidOn: "2026-09-30" }) as { data: { period: unknown } }).data.period, "2026-09", "payment: a registration covers the month it was paid in, whatever month was sent");
ok(!pm({ kind: "jersey", period: "" }).success, "payment: jersey money is not income, so it cannot be recorded");
eq((pm({ discount: "50000" }) as { data: { discount: number } }).data.discount, 50000, "payment: a monthly fee keeps its discount");
ok(!pm({ studentId: "" }).success && !pm({ kind: "donation" }).success && !pm({ amount: "" }).success, "payment: student, a known kind and an amount are required");
ok(expenseSchema(t).safeParse({ spentOn: date, category: "Sewa lapangan", name: "Sewa Oktober", amount: "600000", proofUrl: "", note: "" }).success, "expense: a normal row");
ok(!expenseSchema(t).safeParse({ spentOn: date, category: "", name: "x", amount: "1" }).success && !expenseSchema(t).safeParse({ spentOn: date, category: "x", name: "", amount: "1" }).success, "expense: category and description are required");
ok(ENTITIES.payment.proofs.length === 1 && ENTITIES.expense.proofs.length === 1 && ENTITIES.student.proofs.length === 0, "receipt columns: payment 1, expense 1, student 0");
ok(ENTITIES.registration.proofs.length === 2 && ENTITIES.asset.proofs.length === 1 && ENTITIES.budget.proofs.length === 0, "receipt columns match the workbooks (aset 1, registrasi DP+lunas, match fee 1)");

/* ── Units & logins ── */
const owners2 = [{ name: "Pemilik A", percent: "60", capital: "" }, { name: "Pemilik B", percent: "40", capital: "" }];
const newUnit = (o: Record<string, unknown>) => makeNewUnitSchema(t).safeParse({ code: "liga-1", name: "Liga Satu", type: "liga", description: "", programWeeks: "10", programStartsOn: "", owners: owners2, ...o });
ok(newUnit({}).success, "unit: a Liga unit");
eq(newUnit({ code: "sb-1", name: "Sekolah Satu", type: "sekolah_bola", programWeeks: "" }).data?.code, "SB-1", "unit: “sb-1” → SB-1");
eq(newUnit({ code: "sb-1", name: "Sekolah Satu", type: "sekolah_bola", programWeeks: "" }).data?.programWeeks, 10, "unit: a Sekolah Bola form leaves the program weeks blank → 10");
ok(!newUnit({ type: undefined }).success, "unit: the type is required");
ok(!newUnit({ type: "akademi" }).success, "unit: only Liga or Sekolah Bola");
ok(!newUnit({ code: "has space", name: "X" }).success, "unit: code without spaces");
ok(!newUnit({ code: "OK", name: "Okay", programWeeks: "0" }).success, "unit: program weeks 1–52");
eq(newUnit({ programStartsOn: "2026-10-02" }).data?.programStartsOn, "2026-10-02", "unit: a Liga may name the day week 1 starts");
eq(newUnit({ programStartsOn: "" }).data?.programStartsOn, null, "unit: a blank start day means “from the first real cost”");
ok(!newUnit({ programStartsOn: "2026-02-31" }).success, "unit: the start day must be a real date");
ok(!newUnit({ owners: [] }).success && !newUnit({ owners: undefined }).success, "unit: at least one owner is required");
ok(makeEditUnitSchema(t).safeParse({ name: "Liga Satu", description: "", programWeeks: "12", programStartsOn: "2026-10-02", active: true }).success, "unit: editing needs neither code, type nor owners");
ok(!("type" in makeEditUnitSchema(t).shape) && !("owners" in makeEditUnitSchema(t).shape), "unit: the type cannot be changed after creation, owners are edited on the Dividen page");
ok(!makeNewLoginSchema(t).safeParse({ name: "Unit", email: "nope", password: "12345678" }).success, "login: email must be an email");
ok(!makeNewLoginSchema(t).safeParse({ name: "Unit", email: "a@b.id", password: "short" }).success, "login: password at least 8 characters");

/* ── Kepemilikan: shares in basis points ── */
eq([percentToBp("50"), percentToBp("33,33"), percentToBp("33.3"), percentToBp(12.5), percentToBp("100"), percentToBp("0")], [5000, 3333, 3330, 1250, 10000, 0], "owners: “50”, “33,33”, 12.5 → basis points");
eq([percentToBp(""), percentToBp("abc"), percentToBp("101"), percentToBp("-5"), percentToBp("33.333")], [null, null, null, null, null], "owners: not a number 0–100 with at most two decimals → refused");
eq(bpToField(3333), "33.33", "owners: 3333 bp is written 33.33");
eq(bpToField(5000), "50", "owners: 5000 bp is written 50, no trailing zeros");
eq(equalShares(2), [5000, 5000], "owners: two owners split 50 / 50");
eq(equalShares(3), [3334, 3333, 3333], "owners: three owners split 33.34 / 33.33 / 33.33 (still exactly 100%)");
ok([1, 2, 3, 4, 5, 6, 7].every((n) => equalShares(n).reduce((a, b) => a + b, 0) === BP_TOTAL), "owners: an equal split always totals exactly 100%");
eq(splitByShares(100_000_000, [7000, 3000]), [70_000_000, 30_000_000], "dividend split: 70% / 30% of 100 jt");
eq(splitByShares(100, [3334, 3333, 3333]), [34, 33, 33], "dividend split: the leftover rupiah goes to the biggest fraction");
ok([1, 7, 100, 999_999, 171_700_000, 2_999_999_999].every((total) => splitByShares(total, [3334, 3333, 3333]).reduce((a, b) => a + b, 0) === total), "dividend split: the parts always add up to the dividend");
eq(splitByShares(-100, [7000, 3000]), [-70, -30], "dividend split: a loss is shared the same way");
ok(splitByShares(-101, [3334, 3333, 3333]).reduce((a, b) => a + b, 0) === -101, "dividend split: a loss also adds up exactly");
eq(splitByShares(0, [5000, 5000]), [0, 0], "dividend split: nothing to share");
eq(splitByShares(100, []), [], "dividend split: no owners, no parts");
const rowsOf = (...r: [string, string, string?][]) => r.map(([name, percent, capital]) => ({ name, percent, capital: capital ?? "" }));
ok(ownersSchema(t).safeParse(rowsOf(["A", "60"], ["B", "40"])).success, "owners form: 60 + 40 = 100");
ok(ownersSchema(t).safeParse(rowsOf(["A", "33,34"], ["B", "33,33"], ["C", "33,33"])).success, "owners form: more than two owners are fine");
ok(!ownersSchema(t).safeParse(rowsOf(["A", "60"], ["B", "30"])).success, "owners form: the total must be exactly 100%");
ok(!ownersSchema(t).safeParse(rowsOf(["A", "60"], ["a", "40"])).success, "owners form: two owners cannot share a name");
ok(!ownersSchema(t).safeParse(rowsOf(["", "100"])).success && !ownersSchema(t).safeParse(rowsOf(["A", "0"], ["B", "100"])).success, "owners form: every owner needs a name and a share above 0");
ok(!ownersSchema(t).safeParse([]).success, "owners form: at least one owner");
eq(ownersSchema(t).parse(rowsOf(["A", "60", "Rp 15.000.000"], ["B", "40"])), [{ name: "A", shareBp: 6000, capital: 15000000 }, { name: "B", shareBp: 4000, capital: 0 }], "owners form: shares in basis points, modal read from “Rp 15.000.000”, blank modal = 0");
const posted = new FormData();
for (const [n, pc, cap] of [["A", "70", "100"], ["B", "30", ""]]) {
  posted.append("ownerName", n);
  posted.append("ownerPercent", pc);
  posted.append("ownerCapital", cap);
}
eq(readOwnerRows(posted), [{ name: "A", percent: "70", capital: "100" }, { name: "B", percent: "30", capital: "" }], "owners form: repeated fields are read back as rows");

/* ── RAB: asset lines and locked lines ── */
const budgetInput = { period: "monthly", category: "Biaya Peralatan", name: "Dispenser", quantity: "1", unitPrice: "1000000", note: "" };
eq((budgetSchema(t).parse(budgetInput) as { isAsset: boolean }).isAsset, false, "budget: a line is non-asset unless marked");
eq((budgetSchema(t).parse({ ...budgetInput, assetType: "asset" }) as { isAsset: boolean }).isAsset, true, "budget: the Aset radio marks an asset line");
eq((budgetSchema(t).parse({ ...budgetInput, assetType: "non_asset" }) as { isAsset: boolean }).isAsset, false, "budget: the Non aset radio");
ok(!budgetSchema(t).safeParse({ ...budgetInput, assetType: "maybe" }).success, "budget: only Aset or Non aset");
ok(!("assetType" in (budgetSchema(t).parse({ ...budgetInput, assetType: "asset" }) as object)), "budget: the radio value is stored as isAsset, not as a text column");
eq(budgetLineProgramTotal({ period: "weekly", quantity: 2, unitPrice: 150000 }, 10), 3000000, "asset from the RAB: a weekly line is worth its weekly cost × the program weeks");
eq(budgetLineProgramTotal({ period: "monthly", quantity: 2, unitPrice: 150000 }, 10), 300000, "asset from the RAB: a one-off line is worth its cost once");
const expenseInput = { spentOn: date, category: "Perlengkapan", name: "Bola latihan", amount: "750000", proofUrl: "", note: "" };
eq((expenseSchema(t).parse(expenseInput) as { isAsset: boolean }).isAsset, false, "expense: non-asset by default");
eq((expenseSchema(t).parse({ ...expenseInput, assetType: "asset" }) as { isAsset: boolean }).isAsset, true, "expense: the Aset radio marks an asset expense");

/* ── RAB Actual: weeks and the grid ── */
eq([weekNumber("2026-10-05", "2026-10-05"), weekNumber("2026-10-05", "2026-10-11"), weekNumber("2026-10-05", "2026-10-12"), weekNumber("2026-10-05", "2026-10-04")], [1, 1, 2, 0], "week: 7 days per week, the start day opens week 1, the day before is week 0");
eq(weekNumber("2026-10-05", "2026-09-28"), 0, "week: exactly one week before the start is still week 0 (before the program)");
eq(weekNumber("2026-10-05", "2026-09-27"), -1, "week: earlier dates are negative (the grid shows them as “before”)");
eq(weekNumber("2026-02-23", "2026-03-02"), 2, "week: crosses a month boundary");
eq(weekStartDate("2026-10-05", 1), "2026-10-05", "week: week 1 begins on the start day");
eq(weekStartDate("2026-10-05", 3), "2026-10-19", "week: week 3 begins 14 days later");
eq([mondayOf("2026-10-02"), mondayOf("2026-10-05"), mondayOf("2026-10-11")], ["2026-09-28", "2026-10-05", "2026-10-05"], "monday of the week: Friday → Monday before, Monday → itself, Sunday → the Monday before");
eq(programStart("2026-10-01", ["2026-09-01"]), "2026-10-01", "program start: the date the unit set wins");
eq(programStart(null, ["2026-10-16", "2026-10-02"]), "2026-09-28", "program start: without one, the Monday of the first real cost");
eq(programStart(null, []), null, "program start: nothing yet");

const L = (key: string, category: string, name: string, extra: Record<string, unknown> = {}) => ({ key, source: "budget" as const, id: key.slice(2), category, groupOrder: 0, name, itemOrder: 0, period: "weekly" as "weekly" | "monthly", budget: 1000, isAsset: false, ...extra });
const grid = buildActualGrid(
  [
    L("b:1", "Biaya Peralatan", "Sewa Lapangan", { budget: 6500000, itemOrder: 1 }),
    L("b:2", "Biaya Peralatan", "Print Jadwal", { budget: 175000, itemOrder: 2 }),
    L("b:3", "Biaya Wasit", "Honor Wasit", { groupOrder: 1, budget: 3525000 }),
    // the same category name in the monthly part is a different group, in a different section
    L("b:4", "Biaya Peralatan", "Dispenser", { period: "monthly", budget: 1000000, itemOrder: 3 }),
    L("a:5", "biaya peralatan", "Sewa HT", { source: "extra", period: "weekly", budget: 0, groupOrder: 1_000_000, itemOrder: 0 }),
    L("a:6", "Biaya Hadiah", "Piala tambahan", { source: "extra", period: "monthly", budget: 0, groupOrder: 1_000_000, itemOrder: 1 }),
  ],
  [
    { lineKey: "b:1", amount: 6500000, spentOn: "2026-10-02" },
    { lineKey: "b:1", amount: 6500000, spentOn: "2026-10-09" },
    { lineKey: "b:2", amount: 175000, spentOn: "2026-10-04" },
    { lineKey: "b:2", amount: 25000, spentOn: "2026-10-03" },
    { lineKey: "a:5", amount: 100000, spentOn: "2026-10-09" },
    { lineKey: "b:3", amount: 3450000, spentOn: "2026-10-09" },
    { lineKey: "b:4", amount: 1100000, spentOn: "2026-10-16" },
    { lineKey: "a:6", amount: 50000, spentOn: "2026-10-16" },
    { lineKey: "b:missing", amount: 999, spentOn: "2026-10-16" },
  ],
  10,
  "2026-10-02",
);
eq(grid.start, "2026-10-02", "RAB Actual: the week 1 start comes from the unit");
eq(grid.weeks, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "RAB Actual: one column per program week, none before the program");
eq(grid.weekly.groups.map((g) => [g.category, g.lines.map((l) => l.name)]), [["Biaya Peralatan", ["Sewa Lapangan", "Print Jadwal", "Sewa HT"]], ["Biaya Wasit", ["Honor Wasit"]]], "RAB Actual: weekly part: RAB lines first in RAB order, then the extra line that joins the category of the same name, whatever its case");
eq(grid.monthly.groups.map((g) => [g.category, g.lines.map((l) => l.name)]), [["Biaya Peralatan", ["Dispenser"]], ["Biaya Hadiah", ["Piala tambahan"]]], "RAB Actual: monthly part has its own categories, even with the same name as a weekly one");
const rent = grid.weekly.groups[0].lines[0];
eq([rent.byWeek[1], rent.byWeek[2], rent.total, rent.programBudget, rent.remaining], [6500000, 6500000, 13000000, 65000000, 52000000], "RAB Actual: a weekly line has budget × weeks, costs land in their week, the rest is left");
const print = grid.weekly.groups[0].lines[1];
eq([print.byWeek[1], print.total, print.costs], [200000, 200000, 2], "RAB Actual: two costs in the same week add up (2–4 Oct are both week 1)");
eq(grid.weekly.groups[0].lines[2].programBudget, 0, "RAB Actual: an extra line has no budget");
eq(grid.weekly.groups[0].lines[2].remaining, -100000, "RAB Actual: spending on a line without budget is over budget");
eq(grid.monthly.groups[0].lines[0].programBudget, 1000000, "RAB Actual: a one-off line counts its budget once");
eq(grid.monthly.groups[0].lines[0].remaining, -100000, "RAB Actual: spending above a one-off budget shows as negative");
eq(grid.weekly.groups[1].lines[0].byWeek, { 2: 3450000 }, "RAB Actual: a category's line keeps its own week cells");
eq(grid.weekly.groups[0].byWeek, { 1: 6700000, 2: 6600000 }, "RAB Actual: category totals per week");
eq(grid.weekly.totals.total, 6500000 * 2 + 200000 + 100000 + 3450000, "RAB Actual: the weekly part adds up its costs and ignores a cost whose line does not exist");
eq(grid.monthly.totals.total, 1100000 + 50000, "RAB Actual: the monthly part adds up its own costs");
eq(grid.totals.total, grid.weekly.totals.total + grid.monthly.totals.total, "RAB Actual: the grand total is both parts");
eq(grid.weekly.totals.programBudget, (6500000 + 175000 + 3525000) * 10, "RAB Actual: weekly budget = weekly lines × program weeks");
eq(grid.totals.programBudget, (6500000 + 175000 + 3525000) * 10 + 1000000, "RAB Actual: total budget = weekly lines × weeks + one-off lines");
eq(grid.totals.remaining, grid.totals.programBudget - grid.totals.total, "RAB Actual: remaining = budget − actual");
eq(grid.totals.byWeek, { 1: 6700000, 2: 10050000, 3: 1150000 }, "RAB Actual: totals per week count weekly and monthly costs");
const variance = weeklyVariance(grid.weekly, 2);
eq([variance.budgetPerWeek, variance.budget, variance.actual, variance.difference, variance.average], [10200000, 20400000, 16750000, -3650000, 8375000], "variance: weekly costs of weeks 1–2 against 2 × the weekly budget (monthly costs are not part of it)");
eq(variance.perWeek, { 1: -3500000, 2: -150000 }, "variance: per week = actual − weekly budget (negative = under budget)");
eq(weeklyVariance(grid.weekly, 0).weeks, 0, "variance: nothing before week 1");
const early = buildActualGrid([L("b:1", "X", "Y")], [{ lineKey: "b:1", amount: 5, spentOn: "2026-09-20" }, { lineKey: "b:1", amount: 7, spentOn: "2026-10-30" }], 3, "2026-10-02");
eq(early.weeks, [0, 1, 2, 3, 4, 5], "RAB Actual: a cost before week 1 gets a “before” column; a late cost widens the grid to its week");
eq(early.weekly.groups[0].lines[0].byWeek, { 0: 5, 5: 7 }, "RAB Actual: early and late costs sit in their own columns");
const open = buildActualGrid([L("b:1", "X", "Y")], [{ lineKey: "b:1", amount: 5, spentOn: "2026-10-16" }], 4, null);
eq([open.start, open.weekly.groups[0].lines[0].byWeek], ["2026-10-12", { 1: 5 }], "RAB Actual: with no start day, week 1 starts the Monday of the first cost");
const bare = buildActualGrid([L("b:1", "X", "Y")], [], 4, null);
eq([bare.start, bare.weeks, bare.totals.total], [null, [1, 2, 3, 4], 0], "RAB Actual: no costs and no start day → empty program weeks");
eq(buildActualGrid([], [], 10, null).weekly.groups, [], "RAB Actual: without a RAB there is nothing to show");
eq(buildActualGrid([L("b:1", "X", "Y")], [], 10, null).monthly.groups, [], "RAB Actual: a unit with only weekly lines has an empty monthly part");

const actualItem = (o: Record<string, string>) => actualItemSchema(t).safeParse({ category: "Biaya Peralatan", name: "Sewa HT", note: "", ...o });
ok(actualItem({}).success, "actual line: category and name");
ok(!actualItem({ name: "" }).success && !actualItem({ category: " " }).success, "actual line: category and name are required");
eq(actualItem({}).data?.period, "weekly", "actual line: weekly unless said otherwise");
eq(actualItem({ period: "monthly" }).data?.period, "monthly", "actual line: monthly (one-off) lines are accepted");
ok(!actualItem({ period: "yearly" }).success, "actual line: only weekly or monthly");
const uuid1 = "6f1c2f3e-3b0a-4c63-9c1d-0d7b1d6f9a11";
const actualCost = (o: Record<string, string>) => actualCostSchema(t).safeParse({ itemRef: "b:" + uuid1, amount: "100.000", spentOn: date, proofUrl: "", note: "", ...o });
ok(actualCost({}).success, "actual cost: a RAB line, an amount and a date");
eq(actualCost({}).data, { amount: 100000, spentOn: date, proofUrl: null, note: null, budgetItemId: uuid1, actualItemId: null }, "actual cost: “b:” points at a RAB line");
eq(actualCost({ itemRef: "a:" + uuid1 }).data?.actualItemId, uuid1, "actual cost: “a:” points at an extra line");
eq(actualCost({ itemRef: "a:" + uuid1 }).data?.budgetItemId, null, "actual cost: a cost belongs to one line only");
ok(!actualCost({ itemRef: "" }).success && !actualCost({ itemRef: "x:" + uuid1 }).success && !actualCost({ itemRef: "b:not-an-id" }).success, "actual cost: the line must be picked");
ok(!actualCost({ amount: "0" }).success && !actualCost({ amount: "" }).success, "actual cost: the amount must be above 0");
ok(!actualCost({ spentOn: "2026-02-31" }).success && !actualCost({ spentOn: "" }).success, "actual cost: the date must be a real date");
ok(!actualCost({ proofUrl: "https://evil.example/x.png" }).success, "actual cost: a receipt must be one of our own uploads");
ok(ENTITIES.actualcost.proofs.length === 1 && ENTITIES.actualitem.proofs.length === 0, "receipt columns: an actual cost has one receipt");

/* ── Age groups and other income ── */
const regInput = { clubName: "BSS Jakarta", fee: "1750000", dpAmount: "", dpPaidOn: "", dpProofUrl: "", finalAmount: "", finalPaidOn: "", finalProofUrl: "", note: "" };
eq(registrationSchema(t).parse({ ...regInput, ageGroup: " U8 " }).ageGroup, "U8", "registration: the age group is trimmed");
eq(registrationSchema(t).parse(regInput).ageGroup, "", "registration: no age group is an empty one, not missing");
ok(!registrationSchema(t).safeParse({ ...regInput, ageGroup: "U".repeat(41) }).success, "registration: the age group is at most 40 characters");
eq(matchFeeSchema(t).parse({ clubName: "Maesa", ageGroup: "U9", week: "1", matches: "2", feePerMatch: "500000", proofUrl: "", note: "" }).ageGroup, "U9", "match fee: the age group is kept");
const other = (o: Record<string, string>) => otherIncomeSchema(t).safeParse({ name: "Sewa stand es teh", week: "2", amount: "250.000", proofUrl: "", note: "", ...o });
eq(other({}).data, { name: "Sewa stand es teh", week: 2, amount: 250000, proofUrl: null, note: null }, "other income: a name, a week and an amount");
ok(!other({ name: "" }).success && !other({ week: "0" }).success && !other({ week: "53" }).success && !other({ amount: "" }).success, "other income: name, week 1–52 and amount are required");
ok(!other({ proofUrl: "https://evil.example/x.png" }).success, "other income: a receipt must be one of our own uploads");
ok(ENTITIES.otherincome.proofs.length === 1, "receipt columns: other income has one receipt");
const withOther = unitFigures({ ...ligaData, otherIncome: [{ amount: 61000 }, { amount: 200000 }] });
eq([withOther.otherIncome, withOther.income, withOther.dividend.value], [{ total: 261000, count: 2 }, liga.income, liga.dividend.value], "other income: counted on its own, not in the income of the formula nor the dividend");
eq(unitFigures(ligaData).otherIncome, { total: 0, count: 0 }, "other income: none yet");

/* ── Formatting ── */
const id = makeFormatters("id");
const plain = (s: string) => s.replace(/ /g, " "); // Intl uses non-breaking spaces
eq(plain(id.rupiah(1750000)), "Rp 1.750.000", "format: Rupiah, Indonesian grouping");
eq(plain(id.rupiahCompact(265200000)), "Rp 265,2 jt", "format: compact Rupiah in Indonesian (jt)");
eq(plain(id.rupiahCompact(750000)), "Rp 750 rb", "format: ribu");
eq(plain(id.rupiahCompact(999999)), "Rp 1 jt", "format: 999.999 rolls over to 1 jt, not “1.000 rb”");
eq(plain(id.rupiahCompact(1500)), "Rp 1,5 rb", "format: decimals use the locale separator");
eq([plain(id.rupiahCompact(0)), plain(id.rupiahCompact(999))], ["Rp 0", "Rp 999"], "format: small amounts are written in full");
eq(plain(id.rupiahCompact(-2500000)), "Rp -2,5 jt", "format: negative amounts keep the sign");
eq(plain(id.rupiahCompact(1250000000)), "Rp 1,25 M", "format: miliar in Indonesian");
eq(plain(id.rupiahCompact(3000000000)), "Rp 3 M", "format: the 3 miliar target reads “Rp 3 M”");

console.log(failures ? `\n${failures} check(s) failed` : "\nAll finance checks passed");
process.exit(failures ? 1 : 0);
