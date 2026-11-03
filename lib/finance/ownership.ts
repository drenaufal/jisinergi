/**
 * Kepemilikan (ownership) arithmetic and validation. Pure: no database, no React.
 *
 * A unit has two or more owners; each gets a percentage of the unit's dividend. Percentages are kept in
 * basis points (1 % = 100 bp, 100 % = 10 000 bp) so that they add up exactly and the Rupiah split below
 * never loses a rupiah to floating-point rounding.
 */
import { z } from "zod";
import type { TFunction } from "@/lib/i18n/translate";

export const BP_TOTAL = 10_000;

/** "33,33" · "33.33" · "50" · 50 → 3333 / 5000 basis points; null when it is not a number from 0 to 100. */
export function percentToBp(input: unknown): number | null {
  const raw = typeof input === "number" ? String(input) : typeof input === "string" ? input.trim() : "";
  const text = raw.replace("%", "").replace(",", ".").trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
  const bp = Math.round(Number(text) * 100);
  return bp >= 0 && bp <= BP_TOTAL ? bp : null;
}

/** 3333 → "33.33" (no trailing zeros), for form fields. */
export const bpToField = (bp: number) => String(Number((bp / 100).toFixed(2)));

/** n owners, equal shares that still total exactly 100 %: the first owners take the leftover basis points. */
export function equalShares(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(BP_TOTAL / n);
  const extra = BP_TOTAL - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Splits a Rupiah amount between owners by their shares. The parts always add up to `total` exactly:
 * every owner gets the rounded-down portion, and the rupiah left over go to those with the biggest
 * fraction (the first one on a tie). Works for a negative total (a loss) too.
 */
export function splitByShares(total: number, shares: readonly number[]): number[] {
  const denominator = shares.reduce((a, b) => a + b, 0);
  if (shares.length === 0 || denominator <= 0) return shares.map(() => 0);
  const amount = BigInt(Math.abs(Math.trunc(total)));
  const den = BigInt(denominator);
  const parts = shares.map((s) => {
    const scaled = amount * BigInt(s);
    return { whole: scaled / den, fraction: scaled % den };
  });
  const left = Number(amount - parts.reduce((a, p) => a + p.whole, BigInt(0)));
  const order = parts.map((_, i) => i).sort((a, b) => (parts[b].fraction > parts[a].fraction ? 1 : parts[b].fraction < parts[a].fraction ? -1 : a - b));
  const bonus = new Set(order.slice(0, left));
  const sign = total < 0 ? -1 : 1;
  return parts.map((p, i) => sign * (Number(p.whole) + (bonus.has(i) ? 1 : 0)));
}

/* ── Validation of the owners typed into a form ─────────────────────── */

export type OwnerInput = { name: string; shareBp: number; capital: number };

const rupiahDigits = (v: unknown) => {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return 0;
  const d = v.replace(/[^\d]/g, "");
  return d === "" ? 0 : Number(d);
};

/** The owner rows a form posts as repeated `ownerName` / `ownerPercent` / `ownerCapital` fields. */
export function readOwnerRows(formData: FormData) {
  const names = formData.getAll("ownerName").map(String);
  const percents = formData.getAll("ownerPercent").map(String);
  const capitals = formData.getAll("ownerCapital").map(String);
  return names.map((name, i) => ({ name, percent: percents[i] ?? "", capital: capitals[i] ?? "" }));
}

/**
 * The owner list of a unit: at least one owner, a name each (no duplicates), and shares that total
 * exactly 100 %. `capital` is the money an owner puts in when the unit is created (0 = none).
 */
export const ownersSchema = (t: TFunction) =>
  z
    .array(
      z.object({
        name: z.string().trim().min(1, t("Nama pemilik wajib diisi")).max(120, t("Maksimal {n} karakter", { n: 120 })),
        percent: z.string().transform((v, ctx) => {
          const bp = percentToBp(v);
          if (bp === null || bp <= 0) {
            ctx.addIssue({ code: "custom", message: t("Persentase harus berupa angka lebih dari 0 sampai 100") });
            return z.NEVER;
          }
          return bp;
        }),
        capital: z.unknown().transform(rupiahDigits),
      }),
      t("Isi minimal satu pemilik"),
    )
    .min(1, t("Isi minimal satu pemilik"))
    .max(20, t("Maksimal {n} pemilik", { n: 20 }))
    .superRefine((rows, ctx) => {
      const names = rows.map((r) => r.name.toLowerCase());
      if (new Set(names).size !== names.length) ctx.addIssue({ code: "custom", message: t("Nama pemilik tidak boleh sama") });
      const total = rows.reduce((a, r) => a + (typeof r.percent === "number" ? r.percent : 0), 0);
      if (total !== BP_TOTAL) {
        ctx.addIssue({ code: "custom", message: t("Total persentase harus tepat 100% (sekarang {total}%)", { total: bpToField(total) }) });
      }
    })
    .transform((rows): OwnerInput[] => rows.map((r) => ({ name: r.name, shareBp: r.percent, capital: r.capital })));
