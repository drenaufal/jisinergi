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

/** Each recipient's portion of `grandTotal` (the unit's recorded dividends). */
export function dividendShares<T extends { amount: number }>(rows: readonly T[], grandTotal: number) {
  return rows.map((row) => ({ row, share: share(row.amount, grandTotal) }));
}

/* ── Ringkasan ──────────────────────────────────────────────────────── */

export type UnitFigures = {
  capital: ReturnType<typeof capitalSummary> & { count: number };
  assets: { total: number; count: number; withProof: number };
  registration: { billed: number; received: number; remaining: number; clubs: number; paidClubs: number };
  matchFee: { amount: number; matches: number; weeksPlayed: number };
  budget: BudgetTotals & { lines: number };
  dividends: { total: number; count: number };
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
  dividends: { amount: number }[];
  registrations: RegistrationAmounts[];
  matchFees: (MatchFeeAmounts & { week: number })[];
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
    budget: { ...budget, lines: data.budget.length },
    dividends: { total: sum(data.dividends, (d) => d.amount), count: data.dividends.length },
    income,
    budgetCoverage: share(income, budget.total),
    dividend: ligaDividend({ budget: budget.total, capital: capital.total, registration: received, matchFee: matchFeeTotal }),
  };
}

/* ── Sekolah Bola ───────────────────────────────────────────────────── */

export type PaymentKind = "registration" | "jersey" | "monthly";

export type PaymentAmounts = { studentId: string; kind: PaymentKind; paidOn: string; amount: number; discount: number; period: string | null };
export type ExpenseAmounts = { spentOn: string; category: string; amount: number };

/** "2026-03-14" → "2026-03". */
export const monthOf = (isoDate: string) => isoDate.slice(0, 7);

export function incomeByKind(payments: readonly PaymentAmounts[]) {
  const of = (kind: PaymentKind) => payments.filter((p) => p.kind === kind);
  const registration = sum(of("registration"), (p) => p.amount);
  const jersey = sum(of("jersey"), (p) => p.amount);
  const monthly = sum(of("monthly"), (p) => p.amount);
  return {
    registration,
    jersey,
    monthly,
    total: registration + jersey + monthly,
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
  /** Pemasukan − Pengeluaran over every month so far. */
  dividend: number;
  months: MonthRow[];
};

export function schoolFigures(input: { students: number; payments: readonly PaymentAmounts[]; expenses: readonly ExpenseAmounts[] }): SchoolFigures {
  const income = incomeByKind(input.payments);
  const expense = sum(input.expenses, (e) => e.amount);
  return {
    students: input.students,
    income,
    expense,
    dividend: income.total - expense,
    months: schoolMonthly(input.payments, input.expenses),
  };
}

/** Income per month, split by kind (for the stacked chart). */
export function incomeMonthsByKind(payments: readonly PaymentAmounts[]) {
  const months = new Map<string, Record<PaymentKind, number>>();
  for (const p of payments) {
    const m = monthOf(p.paidOn);
    const r = months.get(m) ?? { registration: 0, jersey: 0, monthly: 0 };
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

/** Per student: which payments they have made, and whether this month's fee is in. */
export function studentStatus(payments: readonly PaymentAmounts[], studentId: string, currentMonth: string) {
  const mine = payments.filter((p) => p.studentId === studentId);
  const monthly = mine.filter((p) => p.kind === "monthly");
  return {
    registered: mine.some((p) => p.kind === "registration"),
    jerseys: mine.filter((p) => p.kind === "jersey").length,
    paidThisMonth: monthly.some((p) => p.period === currentMonth),
    lastMonthly: monthly.map((p) => p.period).filter((p): p is string => !!p).sort().at(-1) ?? null,
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
