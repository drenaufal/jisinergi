/**
 * Keuangan rules that need no database: the seed against the totals Excel computed in the original
 * workbooks, the arithmetic behind every table, input validation and who may see which unit.
 * Run with `npm run test:finance`.
 */
import {
  budgetByCategory,
  budgetLineTotal,
  budgetTotals,
  capitalSummary,
  cumulativeByDate,
  dividendShares,
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
  monthOf,
  ownerDividend,
  schoolFigures,
  schoolMonthly,
  studentStatus,
  type PaymentAmounts,
  type UnitDataset,
} from "@/lib/finance/calc";
import { DIVIDEND_TARGET } from "@/lib/finance/config";
import { currentMonth } from "@/lib/finance/period";
import { UNIT_KINDS } from "@/lib/finance/unit-types";
import {
  ENTITIES,
  assetSchema,
  budgetSchema,
  capitalSchema,
  expenseSchema,
  matchFeeSchema,
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
  DEMO_JERSEY_PRICE,
  DEMO_MONTHLY_DISCOUNT,
  DEMO_MONTHLY_FEE,
  DEMO_MONTHLY_PAID,
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
eq(dividendShares(SEED_DIVIDENDS, X.dividendTotal).map((s) => s.share), [0.7, 0.3], "DEVIDEN: portions 70% / 30% (workbook column CONT)");
eq(dividendShares([{ amount: 70 }], 100)[0].share, 0.7, "DEVIDEN: a portion is the recipient's amount ÷ the total paid out");
eq(cumulativeByDate(SEED_ASSETS).map((p) => p.cumulative), [1000000, 3900000, 4800000, 5300000], "ASET: running total by purchase date");
eq(cumulativeByDate(SEED_ASSETS).map((p) => p.date), ["2026-10-04", "2026-10-07", "2026-10-13", "2026-10-14"], "ASET: two purchases on 7 Oct share one point");

/* ── Liga summary figures and the Liga dividend formula ── */
const ligaData: UnitDataset = {
  programWeeks: 10,
  assets: SEED_ASSETS.map((a) => ({ amount: a.amount, proofUrl: null })),
  capital: SEED_CAPITAL,
  dividends: SEED_DIVIDENDS,
  registrations,
  matchFees,
  budget: SEED_BUDGET,
};
const liga = unitFigures(ligaData);
eq([liga.capital.total, liga.assets.total, liga.income, liga.budget.total, liga.dividends.total], [60000000, 5300000, 33500000, 265200000, 100000000], "Liga summary equals the workbook totals");
ok(Math.abs(liga.budgetCoverage - 33500000 / 265200000) < 1e-12, "Liga: income covers 12.6% of the budget");
eq(unitFigures({ ...ligaData, budget: [] }).budgetCoverage, 0, "no budget → coverage 0, not NaN");

// Dividen (Liga) = RAB − (modal + registrasi + match fee)
eq(liga.dividend, { budget: 265200000, capital: 60000000, registration: 7500000, matchFee: 26000000, funding: 93500000, value: 171700000 }, "DIVIDEN LIGA: 265,2 jt − (60 jt + 7,5 jt + 26 jt) = 171,7 jt");
eq(ligaDividend({ budget: 100, capital: 30, registration: 20, matchFee: 10 }).value, 40, "DIVIDEN LIGA: 100 − (30 + 20 + 10) = 40");
eq(ligaDividend({ budget: 50, capital: 30, registration: 20, matchFee: 10 }).value, -10, "DIVIDEN LIGA: may be negative when funding exceeds the RAB");
eq(ligaDividend({ budget: 0, capital: 0, registration: 0, matchFee: 0 }).value, 0, "DIVIDEN LIGA: an empty unit is 0");

/* ── Sekolah Bola ── */
const pay = (studentId: string, kind: PaymentAmounts["kind"], paidOn: string, amount: number, discount = 0, period: string | null = null): PaymentAmounts => ({ studentId, kind, paidOn, amount, discount, period });
const payments: PaymentAmounts[] = [
  pay("a", "registration", "2026-08-03", 400000, 100000),
  pay("a", "jersey", "2026-08-03", 250000),
  pay("a", "monthly", "2026-08-05", 200000, 0, "2026-08"),
  pay("a", "monthly", "2026-09-05", 150000, 50000, "2026-09"),
  pay("b", "registration", "2026-09-01", 500000),
  pay("b", "monthly", "2026-09-06", 200000, 0, "2026-09"),
];
const expenses = [
  { spentOn: "2026-08-02", category: "Sewa lapangan", amount: 600000 },
  { spentOn: "2026-08-20", category: "Perlengkapan", amount: 100000 },
  { spentOn: "2026-09-02", category: "Sewa lapangan", amount: 600000 },
  { spentOn: "2026-10-02", category: "Sewa lapangan", amount: 600000 },
];
eq(incomeByKind(payments), { registration: 900000, jersey: 250000, monthly: 550000, total: 1700000, discounts: 150000 }, "PEMASUKAN: totals per kind; discounts are not money received");
eq(monthOf("2026-03-14"), "2026-03", "month of a date");
eq(schoolMonthly(payments, expenses), [
  { month: "2026-08", income: 850000, expense: 700000, dividend: 150000 },
  { month: "2026-09", income: 850000, expense: 600000, dividend: 250000 },
  { month: "2026-10", income: 0, expense: 600000, dividend: -600000 },
], "DIVIDEN SEKOLAH BOLA per bulan = pemasukan − pengeluaran (a month with only expenses is negative)");
const school = schoolFigures({ students: 2, payments, expenses });
eq([school.income.total, school.expense, school.dividend], [1700000, 1900000, -200000], "SEKOLAH BOLA: accumulated dividend = Σ monthly = total pemasukan − total pengeluaran");
eq(sum(school.months, (m) => m.dividend), school.dividend, "the months add up to the accumulated dividend");
eq(schoolFigures({ students: 0, payments: [], expenses: [] }).months, [], "an empty school has no months");
eq(incomeMonthsByKind(payments).map((m) => [m.month, m.registration, m.jersey, m.monthly]), [["2026-08", 400000, 250000, 200000], ["2026-09", 500000, 0, 350000]], "income per month split by kind");
eq(expenseByCategory(expenses), [{ category: "Sewa lapangan", amount: 1800000 }, { category: "Perlengkapan", amount: 100000 }], "expenses grouped by category, biggest first");
const st = studentStatus(payments, "a", "2026-09");
eq([st.registered, st.jerseys, st.paidThisMonth, st.lastMonthly, st.totalPaid, st.totalDiscount], [true, 1, true, "2026-09", 1000000, 150000], "student status: registered, jersey, this month paid, totals");
eq(studentStatus(payments, "b", "2026-10").paidThisMonth, false, "student status: has not paid this month");
eq(studentStatus(payments, "zzz", "2026-09"), { registered: false, jerseys: 0, paidThisMonth: false, lastMonthly: null, totalPaid: 0, totalDiscount: 0 }, "student status: unknown student has nothing");
ok(/^\d{4}-\d{2}$/.test(currentMonth()), "current month is YYYY-MM");

/* ── The demo seed is internally consistent ── */
const demoRegs = DEMO_STUDENTS.map((_, i) => DEMO_REGISTRATION_FEE - (DEMO_REGISTRATION_DISCOUNT[i] ?? 0));
ok(demoRegs.every((v) => v > 0), "demo: registration fee after discount stays positive");
ok(DEMO_MONTHLY_PAID.length === DEMO_STUDENTS.length, "demo: every student has a monthly-payment list");
ok(DEMO_MONTHLY_PAID.every((months) => new Set(months).size === months.length), "demo: no student pays the same month twice (unique index)");
ok(DEMO_MONTHLY_FEE > Math.max(0, ...Object.values(DEMO_MONTHLY_DISCOUNT)) && DEMO_JERSEY_PRICE > 0, "demo: discounts are smaller than the fee");
ok(new Set(DEMO_STUDENTS.map((d) => d.jerseyNumber)).size === DEMO_STUDENTS.length, "demo: jersey numbers are unique");
ok(DEMO_EXPENSES.every((e) => e.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(e.spentOn)), "demo: expenses have a positive amount and a date");

/* ── Owner: accumulated dividend vs the 3 miliar target ── */
eq(DIVIDEND_TARGET, 3_000_000_000, "the target is Rp 3.000.000.000 (3 M)");
eq(ownerDividend({ liga: 1_000_000_000, sekolahBola: 500_000_000, target: DIVIDEND_TARGET }), { liga: 1_000_000_000, sekolahBola: 500_000_000, target: 3_000_000_000, accumulated: 1_500_000_000, progress: 0.5, remaining: 1_500_000_000 }, "OWNER: Liga + Sekolah Bola accumulate toward the target (50%)");
eq(ownerDividend({ liga: 2_500_000_000, sekolahBola: 1_000_000_000, target: DIVIDEND_TARGET }).remaining, 0, "OWNER: nothing remains once the target is passed");
ok(ownerDividend({ liga: 2_500_000_000, sekolahBola: 1_000_000_000, target: DIVIDEND_TARGET }).progress > 1, "OWNER: progress may exceed 100%");
eq(ownerDividend({ liga: 100, sekolahBola: -300, target: DIVIDEND_TARGET }).progress, 0, "OWNER: a negative accumulation counts as 0% progress, not negative");
eq(ownerDividend({ liga: 0, sekolahBola: 0, target: DIVIDEND_TARGET }).remaining, DIVIDEND_TARGET, "OWNER: with nothing yet, the whole target remains");
eq(ownerDividend({ liga: liga.dividend.value, sekolahBola: school.dividend, target: DIVIDEND_TARGET }).accumulated, 171700000 - 200000, "OWNER: the accumulated figure is the Liga formula plus the school dividend");

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
ok(Object.keys(ENTITIES).length === 9, "nine kinds of data: six for Liga, three for Sekolah Bola");
ok(Object.keys(ENTITIES).every((k) => [...UNIT_KINDS.liga, ...UNIT_KINDS.sekolah_bola].includes(k)), "every kind of data is assigned to a unit type");
ok(studentSchema(t).safeParse({ name: "Anak Contoh", nickname: "", joinedOn: date, birthDate: "", jerseyNumber: "", note: "" }).success, "student: nickname, birth date and jersey number are optional");
ok(!studentSchema(t).safeParse({ name: "", joinedOn: date, jerseyNumber: "7" }).success, "student: a name is required");
ok(!studentSchema(t).safeParse({ name: "X", joinedOn: date, jerseyNumber: "1000" }).success && !studentSchema(t).safeParse({ name: "X", joinedOn: date, jerseyNumber: "-1" }).success, "student: jersey number 0–999");
ok(!studentSchema(t).safeParse({ name: "X", joinedOn: "" }).success, "student: the join date is required");
const pm = (o: Record<string, string>) => paymentSchema(t).safeParse({ studentId: "s1", kind: "monthly", paidOn: date, amount: "200000", discount: "", period: "2026-10", proofUrl: "", note: "", ...o });
ok(pm({}).success, "payment: a monthly fee with its month");
ok(!pm({ period: "" }).success && !pm({ period: "2026-13" }).success && !pm({ period: "Oktober" }).success, "payment: a monthly fee needs a real month");
ok(pm({ kind: "registration", period: "" }).success, "payment: registration needs no month");
eq((pm({ kind: "registration", period: "2026-10" }) as { data: { period: unknown } }).data.period, null, "payment: a month on a non-monthly payment is dropped");
eq((pm({ kind: "jersey", discount: "50000", period: "" }) as { data: { discount: number } }).data.discount, 0, "payment: a jersey carries no discount");
eq((pm({ discount: "50000" }) as { data: { discount: number } }).data.discount, 50000, "payment: a monthly fee keeps its discount");
ok(!pm({ studentId: "" }).success && !pm({ kind: "donation" }).success && !pm({ amount: "" }).success, "payment: student, a known kind and an amount are required");
ok(expenseSchema(t).safeParse({ spentOn: date, category: "Sewa lapangan", name: "Sewa Oktober", amount: "600000", proofUrl: "", note: "" }).success, "expense: a normal row");
ok(!expenseSchema(t).safeParse({ spentOn: date, category: "", name: "x", amount: "1" }).success && !expenseSchema(t).safeParse({ spentOn: date, category: "x", name: "", amount: "1" }).success, "expense: category and description are required");
ok(ENTITIES.payment.proofs.length === 1 && ENTITIES.expense.proofs.length === 1 && ENTITIES.student.proofs.length === 0, "receipt columns: payment 1, expense 1, student 0");
ok(ENTITIES.registration.proofs.length === 2 && ENTITIES.asset.proofs.length === 1 && ENTITIES.budget.proofs.length === 0, "receipt columns match the workbooks (aset 1, registrasi DP+lunas, match fee 1)");

/* ── Units & logins ── */
ok(makeNewUnitSchema(t).safeParse({ code: "liga-1", name: "Liga Satu", type: "liga", description: "", programWeeks: "10" }).success, "unit: a Liga unit");
eq((makeNewUnitSchema(t).parse({ code: "sb-1", name: "Sekolah Satu", type: "sekolah_bola", description: "", programWeeks: "" })).code, "SB-1", "unit: “sb-1” → SB-1");
eq((makeNewUnitSchema(t).parse({ code: "sb-1", name: "Sekolah Satu", type: "sekolah_bola", description: "", programWeeks: "" })).programWeeks, 10, "unit: a Sekolah Bola form leaves the program weeks blank → 10");
ok(!makeNewUnitSchema(t).safeParse({ code: "SB-1", name: "Sekolah Satu", description: "" }).success, "unit: the type is required");
ok(!makeNewUnitSchema(t).safeParse({ code: "SB-1", name: "Sekolah Satu", type: "akademi", description: "" }).success, "unit: only Liga or Sekolah Bola");
ok(!makeNewUnitSchema(t).safeParse({ code: "has space", name: "X", type: "liga", description: "", programWeeks: "10" }).success, "unit: code without spaces");
ok(!makeNewUnitSchema(t).safeParse({ code: "OK", name: "Okay", type: "liga", description: "", programWeeks: "0" }).success, "unit: program weeks 1–52");
ok(makeEditUnitSchema(t).safeParse({ name: "Liga Satu", description: "", programWeeks: "12", active: true }).success, "unit: editing needs neither code nor type");
ok(!("type" in makeEditUnitSchema(t).shape), "unit: the type cannot be changed after creation");
ok(!makeNewLoginSchema(t).safeParse({ name: "Unit", email: "nope", password: "12345678" }).success, "login: email must be an email");
ok(!makeNewLoginSchema(t).safeParse({ name: "Unit", email: "a@b.id", password: "short" }).success, "login: password at least 8 characters");

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
