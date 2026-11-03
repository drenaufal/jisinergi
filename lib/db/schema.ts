import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  customType,
  date as mysqlDate,
  datetime,
  index,
  int,
  longtext,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/* ═══════════════════════ Column helpers (MariaDB) ══════════════════════ */

/** UUID primary key, generated in the app (MariaDB has no portable uuid default). */
const id = () =>
  char("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/** UUID reference column. */
const uuid = (name: string) => char(name, { length: 36 });

/**
 * UTC instant with millisecond precision. `lib/db/index.ts` pins every
 * connection to `time_zone = '+00:00'`, so DB defaults and `now()` are UTC too.
 */
const timestamp = (name: string) => datetime(name, { mode: "date", fsp: 3 });
const NOW = sql`CURRENT_TIMESTAMP(3)`;

/** Calendar date kept as a `YYYY-MM-DD` string. */
const date = (name: string) => mysqlDate(name, { mode: "string" });

/**
 * JSON column. MariaDB stores JSON as LONGTEXT, so the driver hands back a
 * string — parse it here (MySQL 8 already returns parsed objects).
 */
const json = customType<{ data: unknown; driverData: string }>({
  dataType: () => "json",
  toDriver: (value) => JSON.stringify(value),
  fromDriver: (value) => (typeof value === "string" ? JSON.parse(value) : value),
});

/* ═══════════════════════════ Enums ═══════════════════════════════════ */

/**
 * owner      — sees every business unit, the dividend target, and manages units and logins.
 * unit_admin — belongs to exactly one business unit; inputs and views only that unit.
 */
export const userRole = ["owner", "unit_admin"] as const;

/** liga = league business (six ledgers); sekolah_bola = football school (income from students + expenses). */
export const unitType = ["liga", "sekolah_bola"] as const;

/** image = photos / logos (any signed-in user); document = identity papers (verifiers only). */
export const mediaKind = ["image", "document"] as const;

/* ═══════════════════════════ Auth ═══════════════════════════════════ */

export const users = mysqlTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: mysqlEnum("role", userRole).notNull().default("unit_admin"),
  title: text("title"),
  active: boolean("active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").default(NOW).notNull(),
});

/* ═══════════════════════════ Media ═════════════════════════════════ */

/**
 * Uploaded files (payment receipts) stored inline as base64 so uploads work without
 * any external object store. Served by `/api/media/[id]`.
 */
export const media = mysqlTable("media", {
  id: id(),
  kind: mysqlEnum("kind", mediaKind).notNull(),
  fileName: text("file_name"),
  mimeType: varchar("mime_type", { length: 80 }).notNull(),
  size: int("size").notNull(),
  data: longtext("data").notNull(),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").default(NOW).notNull(),
});

/* ═══════════════════════════ Audit ═════════════════════════════════ */

export const auditLogs = mysqlTable("audit_logs", {
  id: id(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  actorName: text("actor_name"),
  actorRole: text("actor_role"),
  action: varchar("action", { length: 64 }).notNull(),
  entityType: varchar("entity_type", { length: 40 }).notNull(),
  entityId: uuid("entity_id"),
  summary: text("summary").notNull(),
  before: json("before").$type<Record<string, unknown>>(),
  after: json("after").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").default(NOW).notNull(),
});

/* ═══════════════════════ Keuangan (finance) ═══════════════════════
 * Monitoring keuangan per Unit Bisnis. Every ledger row belongs to exactly one unit; a unit admin
 * sees only its own rows (lib/finance/scope.ts), the owner sees them all. A unit is either a Liga
 * or a Sekolah Bola and has the menus of that type (lib/finance/unit-types.ts).
 * The user ↔ unit link lives in its own table (business_unit_members).
 */

/** outstanding = Modal Belum Kembali, returned = Modal Sudah Kembali. */
export const capitalStatus = ["outstanding", "returned"] as const;
/** weekly = repeats every match week (× program weeks); monthly = counted once. */
export const budgetPeriod = ["weekly", "monthly"] as const;

/** Rupiah amount; whole rupiah, so a JS number is exact far beyond any realistic budget. */
const rupiah = (name: string) => bigint(name, { mode: "number" });

export const businessUnits = mysqlTable("business_units", {
  id: id(),
  code: varchar("code", { length: 24 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  /** Decides which menus the unit has (see lib/finance/unit-types.ts). */
  type: mysqlEnum("type", unitType).notNull().default("liga"),
  description: text("description"),
  /** Liga only: how many match weeks the program runs. The RAB multiplies weekly costs by it and the match-fee grid has this many columns. */
  programWeeks: int("program_weeks").notNull().default(10),
  /** Liga only: the first day of week 1. RAB Actual puts every cost in the week it was paid. Blank = the week of the first cost. */
  programStartsOn: date("program_starts_on"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").default(NOW).notNull(),
});

/**
 * KEPEMILIKAN — who owns a unit and what share of its dividend each one gets. Shares are stored in basis
 * points (10 000 = 100 %) so they add up exactly; they must total 10 000 (lib/finance/ownership.ts).
 */
export const finUnitOwners = mysqlTable(
  "fin_unit_owners",
  {
    id: id(),
    businessUnitId: uuid("business_unit_id")
      .notNull()
      .references(() => businessUnits.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    shareBp: int("share_bp").notNull(),
    position: int("position").notNull().default(0),
    createdAt: timestamp("created_at").default(NOW).notNull(),
  },
  (t) => [index("fin_unit_owners_unit_idx").on(t.businessUnitId, t.position)],
);

/** Which unit a login belongs to (an account is in at most one unit). */
export const businessUnitMembers = mysqlTable(
  "business_unit_members",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    businessUnitId: uuid("business_unit_id")
      .notNull()
      .references(() => businessUnits.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").default(NOW).notNull(),
  },
  (t) => [index("business_unit_members_unit_idx").on(t.businessUnitId)],
);

/** Columns every ledger table shares. */
const ledger = () => ({
  businessUnitId: uuid("business_unit_id")
    .notNull()
    .references(() => businessUnits.id, { onDelete: "restrict" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").default(NOW).notNull(),
  updatedAt: timestamp("updated_at").default(NOW).notNull(),
});

/**
 * ASET — equipment & match facilities the unit bought. A row is typed in by hand, or created
 * automatically from an asset line of the RAB (`budgetItemId`) or from a Sekolah Bola expense marked
 * as asset (`expenseId`); those follow their source and cannot be edited here.
 */
export const finAssets = mysqlTable(
  "fin_assets",
  {
    id: id(),
    ...ledger(),
    purchasedOn: date("purchased_on").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    amount: rupiah("amount").notNull(),
    proofUrl: text("proof_url"),
    note: text("note"),
    budgetItemId: uuid("budget_item_id").references(() => finBudgetItems.id, { onDelete: "cascade" }),
    expenseId: uuid("expense_id").references(() => finExpenses.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("fin_assets_unit_date_idx").on(t.businessUnitId, t.purchasedOn),
    uniqueIndex("fin_assets_budget_item_idx").on(t.budgetItemId),
    uniqueIndex("fin_assets_expense_idx").on(t.expenseId),
  ],
);

/** MODAL — money the owners put into the unit, and whether it has been paid back. */
export const finCapital = mysqlTable(
  "fin_capital",
  {
    id: id(),
    ...ledger(),
    ownerName: varchar("owner_name", { length: 120 }).notNull(),
    amount: rupiah("amount").notNull(),
    status: mysqlEnum("status", capitalStatus).notNull().default("outstanding"),
    investedOn: date("invested_on"),
    returnedOn: date("returned_on"),
    note: text("note"),
  },
  (t) => [index("fin_capital_unit_idx").on(t.businessUnitId)],
);

/**
 * DEVIDEN (legacy) — the old amount-based record of profit paid to owners. The Dividen menu now splits the
 * dividend by percentage (fin_unit_owners); migration 0001 copied these rows into owners and nothing reads
 * or writes this table any more. Drop it once the old data is no longer needed.
 */
export const finDividends = mysqlTable(
  "fin_dividends",
  {
    id: id(),
    ...ledger(),
    recipientName: varchar("recipient_name", { length: 120 }).notNull(),
    amount: rupiah("amount").notNull(),
    paidOn: date("paid_on"),
    note: text("note"),
  },
  (t) => [index("fin_dividends_unit_idx").on(t.businessUnitId)],
);

/** UANG MASUK REGISTRASI — one row per club and age group: the fee billed, the down payment and the settlement. */
export const finRegistrations = mysqlTable(
  "fin_registrations",
  {
    id: id(),
    ...ledger(),
    clubName: varchar("club_name", { length: 160 }).notNull(),
    /** The group the club entered ("U8", "U9"…); blank when the league has none. The same club may enter several. */
    ageGroup: varchar("age_group", { length: 40 }).notNull().default(""),
    fee: rupiah("fee").notNull(),
    dpAmount: rupiah("dp_amount").notNull().default(0),
    dpPaidOn: date("dp_paid_on"),
    dpProofUrl: text("dp_proof_url"),
    finalAmount: rupiah("final_amount").notNull().default(0),
    finalPaidOn: date("final_paid_on"),
    finalProofUrl: text("final_proof_url"),
    note: text("note"),
  },
  (t) => [uniqueIndex("fin_registrations_unit_group_club_idx").on(t.businessUnitId, t.ageGroup, t.clubName)],
);

/** UANG MASUK MATCH FEE — one row per club (and age group) per match week: matches played × the fee per match. */
export const finMatchFees = mysqlTable(
  "fin_match_fees",
  {
    id: id(),
    ...ledger(),
    clubName: varchar("club_name", { length: 160 }).notNull(),
    ageGroup: varchar("age_group", { length: 40 }).notNull().default(""),
    week: int("week").notNull(),
    matches: int("matches").notNull(),
    feePerMatch: rupiah("fee_per_match").notNull(),
    proofUrl: text("proof_url"),
    note: text("note"),
  },
  (t) => [uniqueIndex("fin_match_fees_unit_group_club_week_idx").on(t.businessUnitId, t.ageGroup, t.clubName, t.week)],
);

/** PEMASUKAN LAIN — money that is neither registration nor match fee: stand rent, parking tickets… booked per match week. */
export const finOtherIncome = mysqlTable(
  "fin_other_income",
  {
    id: id(),
    ...ledger(),
    name: varchar("name", { length: 160 }).notNull(),
    week: int("week").notNull(),
    amount: rupiah("amount").notNull(),
    proofUrl: text("proof_url"),
    note: text("note"),
  },
  (t) => [index("fin_other_income_unit_week_idx").on(t.businessUnitId, t.week)],
);

/**
 * RAB — budget lines (Rencana Anggaran Biaya): quantity × unit price, grouped by category.
 * A saved line is final: it cannot be edited (lib/finance/records.ts). An asset line also creates a row in ASET.
 */
export const finBudgetItems = mysqlTable(
  "fin_budget_items",
  {
    id: id(),
    ...ledger(),
    period: mysqlEnum("period", budgetPeriod).notNull(),
    category: varchar("category", { length: 160 }).notNull(),
    categoryOrder: int("category_order").notNull().default(0),
    name: varchar("name", { length: 200 }).notNull(),
    itemOrder: int("item_order").notNull().default(0),
    quantity: int("quantity").notNull().default(1),
    unitPrice: rupiah("unit_price").notNull().default(0),
    isAsset: boolean("is_asset").notNull().default(false),
    note: text("note"),
  },
  (t) => [index("fin_budget_items_unit_period_idx").on(t.businessUnitId, t.period)],
);

/** RAB ACTUAL — a cost line that is not in the RAB (added on the RAB Actual page); it has no budget. */
export const finActualItems = mysqlTable(
  "fin_actual_items",
  {
    id: id(),
    ...ledger(),
    /** Which part of the RAB Actual page the line sits in: weekly costs or monthly (one-off) costs. */
    period: mysqlEnum("period", budgetPeriod).notNull().default("weekly"),
    category: varchar("category", { length: 160 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    note: text("note"),
  },
  (t) => [uniqueIndex("fin_actual_items_unit_name_idx").on(t.businessUnitId, t.category, t.name)],
);

/** RAB ACTUAL — money really spent on one cost line: either a RAB line or an extra line, never both. */
export const finActualCosts = mysqlTable(
  "fin_actual_costs",
  {
    id: id(),
    ...ledger(),
    budgetItemId: uuid("budget_item_id").references(() => finBudgetItems.id, { onDelete: "restrict" }),
    actualItemId: uuid("actual_item_id").references(() => finActualItems.id, { onDelete: "restrict" }),
    amount: rupiah("amount").notNull(),
    spentOn: date("spent_on").notNull(),
    proofUrl: text("proof_url"),
    note: text("note"),
  },
  (t) => [
    index("fin_actual_costs_unit_date_idx").on(t.businessUnitId, t.spentOn),
    index("fin_actual_costs_budget_item_idx").on(t.budgetItemId),
    index("fin_actual_costs_actual_item_idx").on(t.actualItemId),
  ],
);

/* ── Sekolah Bola ─────────────────────────────────────────────────────
 * Source workbooks: "SEKOLAH BOLA" (income per student) and "LAPORAN PENGELUARAN SEKOLAH BOLA" (expenses).
 */

/** `jersey` is legacy: jersey money is no longer recorded or counted as income, old rows are ignored. */
export const studentPaymentKind = ["registration", "jersey", "monthly"] as const;

/** SISWA — one child enrolled in the football school (the left-hand columns of the SEKOLAH BOLA sheet). */
export const finStudents = mysqlTable(
  "fin_students",
  {
    id: id(),
    ...ledger(),
    name: varchar("name", { length: 160 }).notNull(),
    nickname: varchar("nickname", { length: 80 }),
    birthDate: date("birth_date"),
    joinedOn: date("joined_on").notNull(),
    jerseyNumber: int("jersey_number"),
    note: text("note"),
  },
  (t) => [index("fin_students_unit_idx").on(t.businessUnitId, t.name)],
);

/** PEMASUKAN — one payment by a student: registration, a jersey purchase, or one month's fee. */
export const finStudentPayments = mysqlTable(
  "fin_student_payments",
  {
    id: id(),
    ...ledger(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => finStudents.id, { onDelete: "cascade" }),
    kind: mysqlEnum("kind", studentPaymentKind).notNull(),
    paidOn: date("paid_on").notNull(),
    /** Money actually received. */
    amount: rupiah("amount").notNull(),
    /** Discount granted on this payment (informational: it is not part of the money received). */
    discount: rupiah("discount").notNull().default(0),
    /** Monthly fees only: the month the payment covers, as YYYY-MM. */
    period: varchar("period", { length: 7 }),
    proofUrl: text("proof_url"),
    note: text("note"),
  },
  (t) => [
    index("fin_student_payments_unit_date_idx").on(t.businessUnitId, t.paidOn),
    uniqueIndex("fin_student_payments_student_kind_period_idx").on(t.studentId, t.kind, t.period),
  ],
);

/** PENGELUARAN — money the football school spent. */
export const finExpenses = mysqlTable(
  "fin_expenses",
  {
    id: id(),
    ...ledger(),
    spentOn: date("spent_on").notNull(),
    category: varchar("category", { length: 120 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    amount: rupiah("amount").notNull(),
    /** An asset expense also creates a row in ASET (see finAssets.expenseId). */
    isAsset: boolean("is_asset").notNull().default(false),
    proofUrl: text("proof_url"),
    note: text("note"),
  },
  (t) => [index("fin_expenses_unit_date_idx").on(t.businessUnitId, t.spentOn)],
);

/* ═══════════════════════════ Type exports ═════════════════════════ */

export type BusinessUnit = typeof businessUnits.$inferSelect;
export type FinAsset = typeof finAssets.$inferSelect;
export type FinCapital = typeof finCapital.$inferSelect;
export type FinDividend = typeof finDividends.$inferSelect;
export type FinRegistration = typeof finRegistrations.$inferSelect;
export type FinMatchFee = typeof finMatchFees.$inferSelect;
export type FinBudgetItem = typeof finBudgetItems.$inferSelect;
export type FinActualItem = typeof finActualItems.$inferSelect;
export type FinOtherIncome = typeof finOtherIncome.$inferSelect;
export type FinActualCost = typeof finActualCosts.$inferSelect;
export type FinUnitOwner = typeof finUnitOwners.$inferSelect;
export type FinStudent = typeof finStudents.$inferSelect;
export type FinStudentPayment = typeof finStudentPayments.$inferSelect;
export type FinExpense = typeof finExpenses.$inferSelect;
export type User = typeof users.$inferSelect;
export type Media = typeof media.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
