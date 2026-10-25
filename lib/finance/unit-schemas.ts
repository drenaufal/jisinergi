import { z } from "zod";
import type { TFunction } from "@/lib/i18n/translate";
import { UNIT_TYPES } from "./unit-types";

/* Validation for business units and their logins. Kept free of database imports so scripts/test-finance.ts can run it. */

const passwordField = (t: TFunction) =>
  z
    .string()
    .min(8, t("Kata sandi minimal 8 karakter"))
    .max(72, t("Kata sandi maksimal 72 byte"))
    .refine((v) => new TextEncoder().encode(v).length <= 72, t("Kata sandi maksimal 72 byte"));

const emailField = (t: TFunction) => z.string().trim().toLowerCase().pipe(z.email(t("Email tidak valid")).max(255));

/** Only Liga units use it (RAB multiplier, match-fee grid); a Sekolah Bola form leaves it blank and gets 10. */
const weeks = (t: TFunction) =>
  z.preprocess(
    (v) => (v === "" || v == null ? 10 : typeof v === "string" ? Number(v) : v),
    z.number(t("Jumlah minggu harus antara 1 dan 52")).int(t("Jumlah minggu harus antara 1 dan 52")).min(1, t("Jumlah minggu harus antara 1 dan 52")).max(52, t("Jumlah minggu harus antara 1 dan 52")),
  );

const description = (t: TFunction) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : null),
    z.string().max(300, t("Maksimal {n} karakter", { n: 300 })).nullable(),
  );

export const makeNewUnitSchema = (t: TFunction) =>
  z.object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{2,24}$/, t("Kode 2–24 huruf/angka tanpa spasi")),
    name: z.string().trim().min(2, t("Nama unit minimal 2 karakter")).max(120, t("Maksimal {n} karakter", { n: 120 })),
    type: z.enum(UNIT_TYPES, t("Pilih jenis unit bisnis")),
    description: description(t),
    programWeeks: weeks(t),
  });

export const makeEditUnitSchema = (t: TFunction) =>
  makeNewUnitSchema(t).omit({ code: true, type: true }).extend({ active: z.boolean() });

export const makeNewLoginSchema = (t: TFunction) =>
  z.object({
    name: z.string().trim().min(2, t("Nama minimal 2 karakter")).max(200, t("Maksimal {n} karakter", { n: 200 })),
    email: emailField(t),
    password: passwordField(t),
  });

export const makeEditLoginSchema = (t: TFunction) =>
  z.object({
    name: z.string().trim().min(2, t("Nama minimal 2 karakter")).max(200, t("Maksimal {n} karakter", { n: 200 })),
    email: emailField(t),
    password: z.preprocess((v) => (v === "" ? undefined : v), passwordField(t).optional()),
    active: z.boolean(),
  });
