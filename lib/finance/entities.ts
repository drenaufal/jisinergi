import { z } from "zod";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import type { MessageId, TFunction } from "@/lib/i18n/translate";
import { msg } from "@/lib/i18n/translate";
import {
  budgetPeriod,
  capitalStatus,
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
} from "@/lib/db/schema";
import { documentUrlField } from "@/lib/media";
import { isIsoDate } from "./period";

/**
 * The kinds of data a unit keeps. Which kinds a unit may hold depends on its type
 * (lib/finance/unit-types.ts): asset and capital belong to both, the rest to one type each.
 */
export const FINANCE_KINDS = ["asset", "capital", "registration", "matchfee", "otherincome", "budget", "actualitem", "actualcost", "student", "payment", "expense"] as const;
export type FinanceKind = (typeof FINANCE_KINDS)[number];
export const isFinanceKind = (v: unknown): v is FinanceKind =>
  typeof v === "string" && (FINANCE_KINDS as readonly string[]).includes(v);

/** Nothing above this is a real amount; it catches an extra pasted zero or three. */
export const MAX_RUPIAH = 9_000_000_000_000;

/* ── field helpers ──────────────────────────────────────────────────── */

/** "1.750.000" / "Rp 1750000" / 1750000 → 1750000. The form sends digits only; this is the safety net. */
const digits = (v: unknown) => {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return undefined;
  const d = v.replace(/[^\d]/g, "");
  return d === "" ? undefined : Number(d);
};

export const moneyField = (t: TFunction) =>
  z.preprocess(
    digits,
    z
      .number(t("Nominal wajib diisi"))
      .int(t("Nominal harus berupa angka bulat"))
      .min(0, t("Nominal tidak boleh negatif"))
      .max(MAX_RUPIAH, t("Nominal terlalu besar — periksa jumlah nol")),
  );

/** Optional amount: blank means 0. */
const moneyOrZero = (t: TFunction) =>
  z.preprocess((v) => (v === "" || v == null ? 0 : digits(v)), moneyField(t));

const dateField = (t: TFunction) => z.string().trim().refine(isIsoDate, t("Tanggal tidak valid"));
const optionalDate = (t: TFunction) =>
  z.preprocess((v) => (v === "" || v == null ? null : v), z.string().trim().refine(isIsoDate, t("Tanggal tidak valid")).nullable());

const text = (t: TFunction, label: MessageId, max: number) =>
  z.string().trim().min(1, t(label)).max(max, t("Maksimal {n} karakter", { n: max }));

const note = (t: TFunction) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(500, t("Maksimal {n} karakter", { n: 500 })).nullable());

const proof = (t: TFunction) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), documentUrlField(t).transform((v) => v || null).nullable());

const wholeNumber = (t: TFunction, min: number, max: number, message: MessageId) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v),
    z.number(t(message)).int(t(message)).min(min, t(message)).max(max, t(message)),
  );

/* ── per-kind schemas ───────────────────────────────────────────────── */

export const assetSchema = (t: TFunction) =>
  z.object({
    purchasedOn: dateField(t),
    name: text(t, "Nama sarana wajib diisi", 160),
    amount: moneyField(t),
    proofUrl: proof(t),
    note: note(t),
  });

export const capitalSchema = (t: TFunction) =>
  z.object({
    ownerName: text(t, "Nama pemodal wajib diisi", 120),
    amount: moneyField(t),
    status: z.enum(capitalStatus, t("Pilih status modal")),
    investedOn: optionalDate(t),
    returnedOn: optionalDate(t),
    note: note(t),
  });

/** The age group / division a club entered ("U8", "U9"…). Optional: blank = the league has no groups. */
const ageGroup = (t: TFunction) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string().max(40, t("Maksimal {n} karakter", { n: 40 })));

export const registrationSchema = (t: TFunction) =>
  z
    .object({
      clubName: text(t, "Nama klub wajib diisi", 160),
      ageGroup: ageGroup(t),
      fee: moneyField(t),
      dpAmount: moneyOrZero(t),
      dpPaidOn: optionalDate(t),
      dpProofUrl: proof(t),
      finalAmount: moneyOrZero(t),
      finalPaidOn: optionalDate(t),
      finalProofUrl: proof(t),
      note: note(t),
    })
    .superRefine((v, ctx) => {
      if (v.dpAmount + v.finalAmount > v.fee) {
        ctx.addIssue({ code: "custom", path: ["finalAmount"], message: t("DP + pelunasan melebihi biaya registrasi") });
      }
    });

export const matchFeeSchema = (t: TFunction) =>
  z.object({
    clubName: text(t, "Nama klub wajib diisi", 160),
    ageGroup: ageGroup(t),
    week: wholeNumber(t, 1, 52, "Minggu harus antara 1 dan 52"),
    matches: wholeNumber(t, 0, 50, "Jumlah laga harus antara 0 dan 50"),
    feePerMatch: moneyField(t),
    proofUrl: proof(t),
    note: note(t),
  });

/** Money that is neither registration nor match fee (stand rent, parking tickets…), booked in a match week. */
export const otherIncomeSchema = (t: TFunction) =>
  z.object({
    name: text(t, "Nama pemasukan wajib diisi", 160),
    week: wholeNumber(t, 1, 52, "Minggu harus antara 1 dan 52"),
    amount: moneyField(t),
    proofUrl: proof(t),
    note: note(t),
  });

/** The Aset / Non aset radio of the RAB and expense forms; kept in the database as a yes/no `isAsset`. */
export const ASSET_TYPES = ["non_asset", "asset"] as const;
const assetType = (t: TFunction) => z.enum(ASSET_TYPES, t("Pilih aset atau non aset")).default("non_asset");
const withIsAsset = <T extends { assetType: (typeof ASSET_TYPES)[number] }>({ assetType, ...rest }: T) => ({
  ...rest,
  isAsset: assetType === "asset",
});

export const budgetSchema = (t: TFunction) =>
  z
    .object({
      period: z.enum(budgetPeriod, t("Pilih jenis biaya")),
      category: text(t, "Kategori wajib diisi", 160),
      name: text(t, "Nama biaya wajib diisi", 200),
      quantity: wholeNumber(t, 0, 1_000_000, "Jumlah harus berupa angka bulat 0 atau lebih"),
      unitPrice: moneyField(t),
      assetType: assetType(t),
      note: note(t),
    })
    .transform(withIsAsset);

/** A cost line the RAB does not have (added on the RAB Actual page). */
export const actualItemSchema = (t: TFunction) =>
  z.object({
    period: z.enum(budgetPeriod, t("Pilih jenis biaya")).default("weekly"),
    category: text(t, "Kategori wajib diisi", 160),
    name: text(t, "Nama biaya wajib diisi", 200),
    note: note(t),
  });

/** What was really spent. `itemRef` is "b:<RAB line id>" or "a:<extra line id>"; records.ts checks it belongs to the unit. */
export const actualCostSchema = (t: TFunction) =>
  z
    .object({
      itemRef: z.string().trim().regex(/^[ab]:[0-9a-f-]{36}$/, t("Pilih keterangan biaya")),
      amount: moneyField(t).refine((v) => v > 0, t("Nominal harus lebih dari 0")),
      spentOn: dateField(t),
      proofUrl: proof(t),
      note: note(t),
    })
    .transform(({ itemRef, ...rest }) => ({
      ...rest,
      budgetItemId: itemRef.startsWith("b:") ? itemRef.slice(2) : null,
      actualItemId: itemRef.startsWith("a:") ? itemRef.slice(2) : null,
    }));

/* ── Sekolah Bola ───────────────────────────────────────────────────── */

const optionalText = (t: TFunction, max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(max, t("Maksimal {n} karakter", { n: max })).nullable());

const optionalInt = (t: TFunction, min: number, max: number, message: MessageId) =>
  z.preprocess(
    (v) => (v === "" || v == null ? null : typeof v === "string" ? Number(v) : v),
    z.number(t(message)).int(t(message)).min(min, t(message)).max(max, t(message)).nullable(),
  );

export const studentSchema = (t: TFunction) =>
  z.object({
    name: text(t, "Nama anak wajib diisi", 160),
    nickname: optionalText(t, 80),
    joinedOn: dateField(t),
    birthDate: optionalDate(t),
    jerseyNumber: optionalInt(t, 0, 999, "Nomor punggung harus antara 0 dan 999"),
    note: note(t),
  });

/** Jersey money is not income, so it cannot be recorded: only these two kinds are accepted. */
export const PAYMENT_KINDS = ["registration", "monthly"] as const;

export const paymentSchema = (t: TFunction) =>
  z
    .object({
      studentId: z.string().trim().min(1, t("Pilih siswa")),
      kind: z.enum(PAYMENT_KINDS, t("Pilih jenis pembayaran")),
      paidOn: dateField(t),
      amount: moneyField(t),
      discount: moneyOrZero(t),
      period: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().nullable()),
      proofUrl: proof(t),
      note: note(t),
    })
    .superRefine((v, ctx) => {
      if (v.kind === "monthly") {
        if (!v.period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v.period)) {
          ctx.addIssue({ code: "custom", path: ["period"], message: t("Pilih bulan yang dibayar") });
        }
      }
    })
    // a monthly fee covers the month it names; the registration fee already includes the fee of the month it was paid in
    .transform((v) => ({
      ...v,
      period: v.kind === "monthly" ? v.period : v.paidOn.slice(0, 7),
    }));

export const expenseSchema = (t: TFunction) =>
  z
    .object({
      spentOn: dateField(t),
      category: text(t, "Kategori wajib diisi", 120),
      name: text(t, "Keterangan pengeluaran wajib diisi", 200),
      amount: moneyField(t),
      assetType: assetType(t),
      proofUrl: proof(t),
      note: note(t),
    })
    .transform(withIsAsset);

export const PAYMENT_KIND_LABEL: Record<(typeof PAYMENT_KINDS)[number], string> = {
  registration: "Registrasi",
  monthly: "Bulanan",
};

/* ── registry ───────────────────────────────────────────────────────── */

export type EntityDef = {
  /** What the data is called, for messages: "Aset", "Modal", … */
  label: MessageId;
  table: MySqlTable;
  schema: (t: TFunction) => z.ZodType<Record<string, unknown>>;
  /** Columns that hold an uploaded receipt (released when replaced or when the row is deleted). */
  proofs: string[];
  /** A short human name for audit lines and toasts. */
  title: (row: Record<string, unknown>) => string;
};

const asText = (v: unknown) => (typeof v === "string" ? v : String(v ?? ""));

export const ENTITIES: Record<FinanceKind, EntityDef> = {
  asset: {
    label: msg("Aset"),
    table: finAssets,
    schema: assetSchema,
    proofs: ["proofUrl"],
    title: (r) => asText(r.name),
  },
  capital: {
    label: msg("Modal"),
    table: finCapital,
    schema: capitalSchema,
    proofs: [],
    title: (r) => asText(r.ownerName),
  },
  registration: {
    label: msg("Uang masuk registrasi"),
    table: finRegistrations,
    schema: registrationSchema,
    proofs: ["dpProofUrl", "finalProofUrl"],
    title: (r) => `${r.ageGroup ? asText(r.ageGroup) + " " : ""}${asText(r.clubName)}`,
  },
  matchfee: {
    label: msg("Uang masuk match fee"),
    table: finMatchFees,
    schema: matchFeeSchema,
    proofs: ["proofUrl"],
    title: (r) => `${r.ageGroup ? asText(r.ageGroup) + " " : ""}${asText(r.clubName)} · W${asText(r.week)}`,
  },
  otherincome: {
    label: msg("Pemasukan lain"),
    table: finOtherIncome,
    schema: otherIncomeSchema,
    proofs: ["proofUrl"],
    title: (r) => `${asText(r.name)} · W${asText(r.week)}`,
  },
  student: {
    label: msg("Siswa"),
    table: finStudents,
    schema: studentSchema,
    proofs: [],
    title: (r) => asText(r.name),
  },
  payment: {
    label: msg("Pembayaran siswa"),
    table: finStudentPayments,
    schema: paymentSchema,
    proofs: ["proofUrl"],
    title: (r) => `${PAYMENT_KIND_LABEL[r.kind as keyof typeof PAYMENT_KIND_LABEL] ?? asText(r.kind)}${r.period ? " " + asText(r.period) : ""}`,
  },
  expense: {
    label: msg("Pengeluaran"),
    table: finExpenses,
    schema: expenseSchema,
    proofs: ["proofUrl"],
    title: (r) => asText(r.name),
  },
  budget: {
    label: msg("RAB"),
    table: finBudgetItems,
    schema: budgetSchema,
    proofs: [],
    title: (r) => asText(r.name),
  },
  actualitem: {
    label: msg("Keterangan biaya"),
    table: finActualItems,
    schema: actualItemSchema,
    proofs: [],
    title: (r) => asText(r.name),
  },
  actualcost: {
    label: msg("Biaya actual"),
    table: finActualCosts,
    schema: actualCostSchema,
    proofs: ["proofUrl"],
    title: (r) => `${asText(r.spentOn)} · Rp ${Number(r.amount ?? 0).toLocaleString("id-ID")}`,
  },
};
