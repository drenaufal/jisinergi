/**
 * Keuangan arithmetic. Pure functions only (no database, no React) so the same rules drive the
 * pages and scripts/test-finance.ts, which checks them against the totals in the original workbooks.
 */

export const sum = <T,>(rows: readonly T[], pick: (row: T) => number) =>
  rows.reduce((total, row) => total + pick(row), 0);

/** Share of a whole as a 0–1 fraction (0 when the whole is 0). */
export const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

/* ── Registrasi ─────────────────────────────────────────────────────── */

export type RegistrationAmounts = { fee: number; dpAmount: number; finalAmount: number };
/** paid = lunas, partial = baru DP / belum lunas, unpaid = belum bayar sama sekali. */
export type RegistrationStatus = "paid" | "partial" | "unpaid";

export const registrationPaid = (r: RegistrationAmounts) => r.dpAmount + r.finalAmount;
export const registrationRemaining = (r: RegistrationAmounts) => Math.max(0, r.fee - registrationPaid(r));

export function registrationStatus(r: RegistrationAmounts): RegistrationStatus {
  const paid = registrationPaid(r);
  if (paid <= 0) return "unpaid";
  return paid >= r.fee ? "paid" : "partial";
}

/* ── Match fee ──────────────────────────────────────────────────────── */

export type MatchFeeAmounts = { matches: number; feePerMatch: number };
export const matchFeeAmount = (r: MatchFeeAmounts) => r.matches * r.feePerMatch;

export type WeekTotal = { week: number; matches: number; amount: number };

/** One entry per week 1…max(programWeeks, last recorded week); weeks nobody has paid yet are zero. */
export function matchFeeByWeek(
  rows: readonly (MatchFeeAmounts & { week: number })[],
  programWeeks: number,
): WeekTotal[] {
  const last = Math.max(programWeeks, ...rows.map((r) => r.week), 0);
  const weeks: WeekTotal[] = Array.from({ length: last }, (_, i) => ({ week: i + 1, matches: 0, amount: 0 }));
  for (const r of rows) {
    const w = weeks[r.week - 1];
    if (!w) continue;
    w.matches += r.matches;
    w.amount += matchFeeAmount(r);
  }
  return weeks;
}

/** Weeks that have at least one match recorded. */
export const playedWeeks = (rows: readonly { week: number; matches: number }[]) =>
  new Set(rows.filter((r) => r.matches > 0).map((r) => r.week)).size;

/* ── RAB ────────────────────────────────────────────────────────────── */

export type BudgetLine = {
  period: "weekly" | "monthly";
  category: string;
  categoryOrder: number;
  name: string;
  itemOrder: number;
  quantity: number;
  unitPrice: number;
};

export const budgetLineTotal = (line: Pick<BudgetLine, "quantity" | "unitPrice">) => line.quantity * line.unitPrice;

/** What a line costs over the whole program: a weekly line repeats every match week, a monthly one counts once. */
export const budgetLineProgramTotal = (line: Pick<BudgetLine, "period" | "quantity" | "unitPrice">, programWeeks: number) =>
  budgetLineTotal(line) * (line.period === "weekly" ? programWeeks : 1);

export type BudgetGroup<T extends BudgetLine> = {
  period: T["period"];
  category: string;
  categoryOrder: number;
  items: T[];
  subtotal: number;
};

/** Lines grouped per period and category, both in the order the unit entered them. */
export function groupBudget<T extends BudgetLine>(lines: readonly T[]) {
  const out: Record<"weekly" | "monthly", BudgetGroup<T>[]> = { weekly: [], monthly: [] };
  const sorted = [...lines].sort(
    (a, b) => a.categoryOrder - b.categoryOrder || a.category.localeCompare(b.category) || a.itemOrder - b.itemOrder,
  );
  for (const line of sorted) {
    const groups = out[line.period];
    let group = groups.find((g) => g.category === line.category);
    if (!group) {
      group = { period: line.period, category: line.category, categoryOrder: line.categoryOrder, items: [], subtotal: 0 };
      groups.push(group);
    }
    group.items.push(line);
    group.subtotal += budgetLineTotal(line);
  }
  return out;
}

export type BudgetTotals = {
  /** Weekly costs for one match week. */
  weeklyPerWeek: number;
  /** Weekly costs for the whole program (× program weeks). */
  weeklyProgram: number;
  /** Monthly (one-off) costs, counted once. */
  monthly: number;
  /** Estimasi OPEX = weeklyProgram + monthly. */
  total: number;
};

export function budgetTotals(lines: readonly BudgetLine[], programWeeks: number): BudgetTotals {
  const weeklyPerWeek = sum(lines.filter((l) => l.period === "weekly"), budgetLineTotal);
  const monthly = sum(lines.filter((l) => l.period === "monthly"), budgetLineTotal);
  const weeklyProgram = weeklyPerWeek * programWeeks;
  return { weeklyPerWeek, weeklyProgram, monthly, total: weeklyProgram + monthly };
}

/** What each category costs over the whole program (weekly categories × program weeks). */
export function budgetByCategory(lines: readonly BudgetLine[], programWeeks: number) {
  const groups = groupBudget(lines);
  const rows = [
    ...groups.weekly.map((g) => ({ category: g.category, period: "weekly" as const, amount: g.subtotal * programWeeks })),
    ...groups.monthly.map((g) => ({ category: g.category, period: "monthly" as const, amount: g.subtotal })),
  ];
  return rows.sort((a, b) => b.amount - a.amount);
}

/* ── Aset ───────────────────────────────────────────────────────────── */

/** Running total by purchase date; purchases on the same day are merged into one point. */
export function cumulativeByDate(rows: readonly { purchasedOn: string; amount: number }[]) {
  const byDate = new Map<string, number>();
  for (const r of rows) byDate.set(r.purchasedOn, (byDate.get(r.purchasedOn) ?? 0) + r.amount);
  let running = 0;
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount, cumulative: (running += amount) }));
}

/* ── Modal & Dividen ────────────────────────────────────────────────── */

export function capitalSummary(rows: readonly { amount: number; status: "outstanding" | "returned" }[]) {
  const total = sum(rows, (r) => r.amount);
  const returned = sum(rows.filter((r) => r.status === "returned"), (r) => r.amount);
  return { total, returned, outstanding: total - returned, returnedShare: share(returned, total) };
}

/* ── Ringkasan ──────────────────────────────────────────────────────── */

export type UnitFigures = {
  capital: ReturnType<typeof capitalSummary> & { count: number };
  assets: { total: number; count: number; withProof: number };
  registration: { billed: number; received: number; remaining: number; clubs: number; paidClubs: number };
  matchFee: { amount: number; matches: number; weeksPlayed: number };
  /** Stand rent, parking tickets… — shown next to the income, but not part of the dividend formula. */
  otherIncome: { total: number; count: number };
  budget: BudgetTotals & { lines: number };
  /** Everything received from clubs: registration payments + match fees. */
  income: number;
  /** Income as a share of the budget (can exceed 1). */
  budgetCoverage: number;
  /** Dividen (Liga) = RAB − (modal + registrasi + match fee). */
  dividend: LigaDividend;
};

export type UnitDataset = {
  programWeeks: number;
  assets: { amount: number; proofUrl: string | null }[];
  capital: { amount: number; status: "outstanding" | "returned" }[];
  registrations: RegistrationAmounts[];
  matchFees: (MatchFeeAmounts & { week: number })[];
  otherIncome?: { amount: number }[];
  budget: BudgetLine[];
};

/* ── Dividen Liga ───────────────────────────────────────────────────── */

export type LigaDividend = {
  /** Total RAB (estimasi OPEX). */
  budget: number;
  /** Uang modal (all capital put in). */
  capital: number;
  /** Uang masuk registrasi (DP + pelunasan received). */
  registration: number;
  /** Uang masuk match fee. */
  matchFee: number;
  /** capital + registration + matchFee. */
  funding: number;
  /** RAB − (modal + registrasi + match fee). */
  value: number;
};

/** Dividen (Liga) = RAB − (uang modal + registrasi + match fee). */
export function ligaDividend(input: { budget: number; capital: number; registration: number; matchFee: number }): LigaDividend {
  const funding = input.capital + input.registration + input.matchFee;
  return { ...input, funding, value: input.budget - funding };
}

export function unitFigures(data: UnitDataset): UnitFigures {
  const capital = capitalSummary(data.capital);
  const received = sum(data.registrations, registrationPaid);
  const billed = sum(data.registrations, (r) => r.fee);
  const matchFeeTotal = sum(data.matchFees, matchFeeAmount);
  const budget = budgetTotals(data.budget, data.programWeeks);
  const income = received + matchFeeTotal;
  return {
    capital: { ...capital, count: data.capital.length },
    assets: {
      total: sum(data.assets, (a) => a.amount),
      count: data.assets.length,
      withProof: data.assets.filter((a) => !!a.proofUrl).length,
    },
    registration: {
      billed,
      received,
      remaining: Math.max(0, billed - received),
      clubs: data.registrations.length,
      paidClubs: data.registrations.filter((r) => registrationStatus(r) === "paid").length,
    },
    matchFee: {
      amount: matchFeeTotal,
      matches: sum(data.matchFees, (m) => m.matches),
      weeksPlayed: playedWeeks(data.matchFees),
    },
    otherIncome: { total: sum(data.otherIncome ?? [], (o) => o.amount), count: (data.otherIncome ?? []).length },
    budget: { ...budget, lines: data.budget.length },
    income,
    budgetCoverage: share(income, budget.total),
    dividend: ligaDividend({ budget: budget.total, capital: capital.total, registration: received, matchFee: matchFeeTotal }),
  };
}

/* ── Sekolah Bola ───────────────────────────────────────────────────── */

/**
 * What a student pays the school. Jersey money is not income and is no longer recorded (old `jersey` rows
 * are filtered out when payments are read), so only these two kinds exist here.
 */
export type PaymentKind = "registration" | "monthly";

export type PaymentAmounts = { studentId: string; kind: PaymentKind; paidOn: string; amount: number; discount: number; period: string | null };
export type ExpenseAmounts = { spentOn: string; category: string; amount: number };

/** "2026-03-14" → "2026-03". */
export const monthOf = (isoDate: string) => isoDate.slice(0, 7);

/**
 * The month a payment pays for. A monthly fee names its month; the registration fee already includes the
 * fee of the month it was paid in, so it covers that month too (rows saved before this rule have no period).
 */
export const coveredMonth = (p: Pick<PaymentAmounts, "kind" | "paidOn" | "period">) => p.period ?? (p.kind === "registration" ? monthOf(p.paidOn) : null);

export function incomeByKind(payments: readonly PaymentAmounts[]) {
  const of = (kind: PaymentKind) => payments.filter((p) => p.kind === kind);
  const registration = sum(of("registration"), (p) => p.amount);
  const monthly = sum(of("monthly"), (p) => p.amount);
  return {
    registration,
    monthly,
    total: registration + monthly,
    discounts: sum(payments, (p) => p.discount),
  };
}

export type MonthRow = { month: string; income: number; expense: number; dividend: number };

/**
 * Dividen (Sekolah Bola) per bulan = Pemasukan − Pengeluaran. Cash basis: a payment counts in the month
 * it was received, an expense in the month it was spent. Months with neither are not listed.
 */
export function schoolMonthly(payments: readonly PaymentAmounts[], expenses: readonly ExpenseAmounts[]): MonthRow[] {
  const months = new Map<string, MonthRow>();
  const row = (month: string) => {
    let r = months.get(month);
    if (!r) months.set(month, (r = { month, income: 0, expense: 0, dividend: 0 }));
    return r;
  };
  for (const p of payments) row(monthOf(p.paidOn)).income += p.amount;
  for (const e of expenses) row(monthOf(e.spentOn)).expense += e.amount;
  return [...months.values()]
    .map((r) => ({ ...r, dividend: r.income - r.expense }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export type SchoolFigures = {
  students: number;
  income: ReturnType<typeof incomeByKind>;
  expense: number;
  /** Sisa saldo = Pemasukan − Pengeluaran over every month so far. It is also the school's dividend. */
  dividend: number;
  months: MonthRow[];
  /** Everything the school owns: assets bought directly or through an asset expense. */
  assets: { total: number; count: number };
  /** Modal put in by the owners. */
  capital: ReturnType<typeof capitalSummary> & { count: number };
};

export function schoolFigures(input: {
  students: number;
  payments: readonly PaymentAmounts[];
  expenses: readonly ExpenseAmounts[];
  assets?: readonly { amount: number }[];
  capital?: readonly { amount: number; status: "outstanding" | "returned" }[];
}): SchoolFigures {
  const income = incomeByKind(input.payments);
  const expense = sum(input.expenses, (e) => e.amount);
  const assets = input.assets ?? [];
  const capital = input.capital ?? [];
  return {
    students: input.students,
    income,
    expense,
    dividend: income.total - expense,
    months: schoolMonthly(input.payments, input.expenses),
    assets: { total: sum(assets, (a) => a.amount), count: assets.length },
    capital: { ...capitalSummary(capital), count: capital.length },
  };
}

/** Income per month, split by kind (for the stacked chart). */
export function incomeMonthsByKind(payments: readonly PaymentAmounts[]) {
  const months = new Map<string, Record<PaymentKind, number>>();
  for (const p of payments) {
    const m = monthOf(p.paidOn);
    const r = months.get(m) ?? { registration: 0, monthly: 0 };
    r[p.kind] += p.amount;
    months.set(m, r);
  }
  return [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));
}

/** Expense totals per category, biggest first. */
export function expenseByCategory(expenses: readonly ExpenseAmounts[]) {
  const map = new Map<string, number>();
  for (const e of expenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
  return [...map.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}

/** Per student: which payments they have made, and whether this month's fee is in (a registration covers its own month). */
export function studentStatus(payments: readonly PaymentAmounts[], studentId: string, currentMonth: string) {
  const mine = payments.filter((p) => p.studentId === studentId);
  const months = mine.map(coveredMonth).filter((m): m is string => !!m);
  return {
    registered: mine.some((p) => p.kind === "registration"),
    paidThisMonth: months.includes(currentMonth),
    lastMonthly: [...months].sort().at(-1) ?? null,
    totalPaid: sum(mine, (p) => p.amount),
    totalDiscount: sum(mine, (p) => p.discount),
  };
}

/* ── Owner: accumulated dividend vs target ──────────────────────────── */

export type OwnerDividend = {
  liga: number;
  sekolahBola: number;
  /** liga + sekolahBola. */
  accumulated: number;
  target: number;
  /** accumulated ÷ target as a 0–1 fraction (negative accumulated counts as 0; can exceed 1). */
  progress: number;
  /** What is still missing to reach the target (0 once reached). */
  remaining: number;
};

export function ownerDividend(input: { liga: number; sekolahBola: number; target: number }): OwnerDividend {
  const accumulated = input.liga + input.sekolahBola;
  return {
    ...input,
    accumulated,
    progress: share(Math.max(0, accumulated), input.target),
    remaining: Math.max(0, input.target - accumulated),
  };
}

/* ── RAB Actual ─────────────────────────────────────────────────────── */

const DAY_MS = 86_400_000;
/** Whole days since 1970-01-01 for a YYYY-MM-DD date (UTC, so daylight saving cannot shift it). */
const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
};
const isoOfDay = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

/** The Monday of the week a date falls in. */
export function mondayOf(iso: string) {
  const day = dayNumber(iso);
  const weekday = new Date(day * DAY_MS).getUTCDay(); // 0 = Sunday
  return isoOfDay(day - ((weekday + 6) % 7));
}

/** Program week of a date: the `start` day opens week 1. Dates before the start give 0 or a negative number. */
export const weekNumber = (start: string, date: string) => Math.floor((dayNumber(date) - dayNumber(start)) / 7) + 1;

/** The date a program week begins on (week 1 begins on `start`). */
export const weekStartDate = (start: string, week: number) => isoOfDay(dayNumber(start) + 7 * (week - 1));

/** First day of week 1: the date the unit set, else the Monday of its earliest cost, else nothing yet. */
export function programStart(startsOn: string | null, costDates: readonly string[]): string | null {
  if (startsOn) return startsOn;
  const first = [...costDates].sort()[0];
  return first ? mondayOf(first) : null;
}

/** One row of the RAB Actual grid: a RAB line (`b:<id>`) or a cost line added on that page (`a:<id>`). */
export type ActualLineInput = {
  key: string;
  source: "budget" | "extra";
  id: string;
  category: string;
  /** Orders the groups of a section: RAB categories in RAB order, then categories only the extra lines use. */
  groupOrder: number;
  name: string;
  itemOrder: number;
  /** Which part of the page the line sits in: weekly costs repeat every match week, monthly ones are one-off. */
  period: "weekly" | "monthly";
  /** The RAB line total (quantity × unit price): per match week for a weekly line, once for a monthly one. 0 for an extra line. */
  budget: number;
  isAsset: boolean;
};
export type ActualCostInput = { lineKey: string; amount: number; spentOn: string };

export type ActualLine = ActualLineInput & {
  /** The budget over the whole program (weekly × program weeks). */
  programBudget: number;
  /** Money spent per week bucket (0 = before week 1). */
  byWeek: Record<number, number>;
  total: number;
  /** programBudget − total; negative = over budget. */
  remaining: number;
  costs: number;
};
export type ActualTotals = { budget: number; programBudget: number; byWeek: Record<number, number>; total: number; remaining: number };
export type ActualGroup = ActualTotals & { category: string; lines: ActualLine[] };
export type ActualSection = { period: "weekly" | "monthly"; groups: ActualGroup[]; totals: ActualTotals };
export type ActualGrid = {
  start: string | null;
  /** Column headers: week numbers 1…n, preceded by 0 ("before the program") only when something was paid then. */
  weeks: number[];
  /** Weekly costs and monthly (one-off) costs are separate parts, each with its own categories and totals. */
  weekly: ActualSection;
  monthly: ActualSection;
  /** Both parts together ("Total estimasi OPEX"). */
  totals: ActualTotals;
};

const emptyTotals = (): ActualTotals => ({ budget: 0, programBudget: 0, byWeek: {}, total: 0, remaining: 0 });

function addInto(target: ActualTotals, part: ActualTotals) {
  target.budget += part.budget;
  target.programBudget += part.programBudget;
  target.total += part.total;
  target.remaining += part.remaining;
  for (const [w, amount] of Object.entries(part.byWeek)) target.byWeek[Number(w)] = (target.byWeek[Number(w)] ?? 0) + amount;
}

/**
 * The RAB Actual grid: every cost line with its budget and, per program week, what was really spent
 * (a cost lands in the week of its date, costs of one week add up). Weekly and monthly lines form two
 * sections; inside a section lines are grouped by category, RAB lines first and in RAB order, then the
 * extra lines. A category is the same group whichever page named it, whatever its case.
 */
export function buildActualGrid(
  lines: readonly ActualLineInput[],
  costs: readonly ActualCostInput[],
  programWeeks: number,
  startsOn: string | null,
): ActualGrid {
  const start = programStart(startsOn, costs.map((c) => c.spentOn));
  const bucket = (date: string) => (start ? Math.max(0, weekNumber(start, date)) : 0);

  const byKey = new Map<string, ActualLine>();
  for (const l of lines) {
    const programBudget = l.budget * (l.period === "weekly" ? programWeeks : 1);
    byKey.set(l.key, { ...l, programBudget, byWeek: {}, total: 0, remaining: programBudget, costs: 0 });
  }
  let lastWeek = programWeeks;
  let hasBefore = false;
  for (const c of costs) {
    const line = byKey.get(c.lineKey);
    if (!line) continue;
    const w = bucket(c.spentOn);
    if (w === 0) hasBefore = true;
    lastWeek = Math.max(lastWeek, w);
    line.byWeek[w] = (line.byWeek[w] ?? 0) + c.amount;
    line.total += c.amount;
    line.remaining -= c.amount;
    line.costs += 1;
  }

  const section = (period: "weekly" | "monthly"): ActualSection => {
    const ordered = [...byKey.values()].filter((l) => l.period === period).sort((a, b) => a.groupOrder - b.groupOrder || a.itemOrder - b.itemOrder);
    const groups = new Map<string, ActualGroup>();
    for (const line of ordered) {
      const key = line.category.toLowerCase();
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { category: line.category, lines: [], ...emptyTotals() }));
      g.lines.push(line);
      addInto(g, line);
    }
    const list = [...groups.values()];
    const totals = emptyTotals();
    for (const g of list) addInto(totals, g);
    return { period, groups: list, totals };
  };

  const weekly = section("weekly");
  const monthly = section("monthly");
  const totals = emptyTotals();
  addInto(totals, weekly.totals);
  addInto(totals, monthly.totals);
  const weeks = [...(hasBefore ? [0] : []), ...Array.from({ length: lastWeek }, (_, i) => i + 1)];
  return { start, weeks, weekly, monthly, totals };
}

/**
 * How the weekly costs did against their weekly budget up to week `upToWeek` (the weeks that have started).
 * Positive `difference` = spent more than budgeted. Mirrors the "selisih" rows of the Excel sheet.
 */
export function weeklyVariance(weekly: ActualSection, upToWeek: number) {
  const weeks = Array.from({ length: Math.max(0, upToWeek) }, (_, i) => i + 1);
  const budgetPerWeek = weekly.totals.budget;
  const actual = sum(weeks, (w) => weekly.totals.byWeek[w] ?? 0);
  return {
    weeks: weeks.length,
    budgetPerWeek,
    budget: budgetPerWeek * weeks.length,
    actual,
    difference: actual - budgetPerWeek * weeks.length,
    average: weeks.length ? Math.round(actual / weeks.length) : 0,
    /** Per week: actual − weekly budget. */
    perWeek: Object.fromEntries(weeks.map((w) => [w, (weekly.totals.byWeek[w] ?? 0) - budgetPerWeek])) as Record<number, number>,
  };
}

/* ── Age groups ─────────────────────────────────────────────────────── */

/** "U8" before "U9" before "U10"; rows without a group go last. */
export const compareAgeGroups = (a: string, b: string) => (a === b ? 0 : a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "id", { numeric: true }));

/** The label of a team: "U8 · BSS Jakarta", or just the club when the league has no groups. */
export const teamLabel = (team: { ageGroup: string; clubName: string }) => (team.ageGroup ? `${team.ageGroup} · ${team.clubName}` : team.clubName);
