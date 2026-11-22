import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { finOwners, finSavings, savingDirection } from "@/lib/db/schema";
import { auditText, recordAudit } from "@/lib/audit";
import type { TFunction } from "@/lib/i18n/translate";
import { FinanceRuleError, type Actor } from "./records";

/**
 * NABUNG — the Owner's savings book. Not tied to a business unit: each row is money one person put in ("masuk")
 * or took out ("keluar"). A person's "jumlah uang" = everything in − everything out. People are matched by name,
 * trimmed and case-insensitive, so "Andi" and "andi " are the same person.
 */

export type SavingDirection = (typeof savingDirection)[number];
export type SavingRow = { id: string; name: string; direction: SavingDirection; amount: number; savedOn: string };
export type SavingBalance = { name: string; in: number; out: number; balance: number; count: number };

export const savingKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** One line per person: total in, total out and what is left, largest balance first. The first spelling seen wins. */
export function savingsBalances(rows: readonly Pick<SavingRow, "name" | "direction" | "amount">[]): SavingBalance[] {
  const map = new Map<string, SavingBalance>();
  for (const r of rows) {
    const key = savingKey(r.name);
    const cur = map.get(key) ?? { name: r.name.trim(), in: 0, out: 0, balance: 0, count: 0 };
    if (r.direction === "in") cur.in += r.amount;
    else cur.out += r.amount;
    cur.balance = cur.in - cur.out;
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
}

export const savingSchema = (t: TFunction) =>
  z.object({
    name: z
      .string()
      .transform((v) => v.trim().replace(/\s+/g, " "))
      .pipe(z.string().min(1, t("Isi nama")).max(120, t("Nama terlalu panjang"))),
    amount: z.coerce.number(t("Isi nominal")).int(t("Isi nominal")).min(1, t("Nominal harus lebih dari 0")).max(1e13, t("Nominal terlalu besar")),
    savedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t("Isi tanggal")),
    direction: z.enum(savingDirection, t("Pilih masuk atau keluar")),
  });
export type SavingInput = z.infer<ReturnType<typeof savingSchema>>;

/** Every record, newest first (by date, then by when it was entered). */
export const listSavings = (): Promise<SavingRow[]> =>
  db
    .select({ id: finSavings.id, name: finSavings.name, direction: finSavings.direction, amount: finSavings.amount, savedOn: finSavings.savedOn })
    .from(finSavings)
    .orderBy(desc(finSavings.savedOn), desc(finSavings.createdAt));

/** Owner names for Nabung: strictly from Data Owner (fin_owners) that are active. */
export async function savingNameSuggestions(): Promise<string[]> {
  const globalOwners = await db
    .select({ name: finOwners.name })
    .from(finOwners)
    .where(eq(finOwners.active, true))
    .orderBy(asc(finOwners.name));
  return globalOwners.map((g) => g.name.trim()).filter(Boolean);
}

async function balanceOf(name: string) {
  const rows = await db.select({ name: finSavings.name, direction: finSavings.direction, amount: finSavings.amount }).from(finSavings);
  const key = savingKey(name);
  const mine = savingsBalances(rows.filter((r) => savingKey(r.name) === key));
  return { balance: mine[0]?.balance ?? 0, spelling: mine[0]?.name ?? null };
}

const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

/** Records money in or out. Taking out more than the person has is refused. */
export async function addSaving(t: TFunction, actor: Actor, values: SavingInput) {
  const { balance, spelling } = await balanceOf(values.name);
  // keep one spelling per person
  const name = spelling ?? values.name;
  if (values.direction === "out" && values.amount > balance) {
    throw new FinanceRuleError(t("Periksa kembali isian formulir."), {
      amount: balance > 0 ? t("Uang {name} hanya {amount}.", { name, amount: rp(balance) }) : t("{name} belum punya uang tabungan.", { name }),
    });
  }
  const id = crypto.randomUUID();
  await db.insert(finSavings).values({ id, name, direction: values.direction, amount: values.amount, savedOn: values.savedOn, createdBy: actor.id });
  await recordAudit({
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: `finance.saving.${values.direction}`,
    entityType: "fin_saving",
    entityId: id,
    summary: auditText(values.direction === "in" ? "Nabung — uang masuk {name}: {amount} ({date})" : "Nabung — uang keluar {name}: {amount} ({date})", {
      name,
      amount: rp(values.amount),
      date: values.savedOn,
    }),
  });
}

/** Removes one record. Removing money in that was already taken out (balance would go below 0) is refused. */
export async function deleteSaving(t: TFunction, actor: Actor, id: string) {
  const [row] = await db.select().from(finSavings).where(eq(finSavings.id, id)).limit(1);
  if (!row) throw new FinanceRuleError(t("Data tidak ditemukan."));
  if (row.direction === "in") {
    const { balance } = await balanceOf(row.name);
    if (balance - row.amount < 0) {
      throw new FinanceRuleError(t("Uang masuk ini sudah terpakai untuk uang keluar {name}. Hapus uang keluarnya terlebih dahulu.", { name: row.name }));
    }
  }
  await db.delete(finSavings).where(eq(finSavings.id, id));
  await recordAudit({
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: "finance.saving.delete",
    entityType: "fin_saving",
    entityId: id,
    summary: auditText("Nabung — catatan dihapus: {name} {direction} {amount} ({date})", {
      name: row.name,
      direction: row.direction === "in" ? "masuk" : "keluar",
      amount: rp(row.amount),
      date: row.savedOn,
    }),
  });
}
