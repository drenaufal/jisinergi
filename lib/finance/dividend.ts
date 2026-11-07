import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessUnits, finUnitOwners } from "@/lib/db/schema";
import { APP_TIME_ZONE } from "@/lib/i18n/format";
import type { TFunction } from "@/lib/i18n/translate";
import { schoolFigures, unitFigures } from "./calc";
import { ligaDataset, schoolDataset } from "./queries";
import { maxTaken, ownerPayouts } from "./ownership";
import { UnitRuleError } from "./units";

/* Pengambilan dividen: the owners of a unit take their share of its dividend. Liga: all or nothing, and only once the
 * event is finished. Sekolah Bola: any amount up to the share. The rules live here, the Dividen page only shows them. */

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: APP_TIME_ZONE });

type UnitRow = { id: string; name: string; type: "liga" | "sekolah_bola"; programWeeks: number; leagueFinishedOn: string | null };

async function loadUnit(t: TFunction, unitId: string): Promise<UnitRow> {
  const [unit] = await db
    .select({ id: businessUnits.id, name: businessUnits.name, type: businessUnits.type, programWeeks: businessUnits.programWeeks, leagueFinishedOn: businessUnits.leagueFinishedOn })
    .from(businessUnits)
    .where(eq(businessUnits.id, unitId));
  if (!unit) throw new UnitRuleError(t("Unit bisnis tidak ditemukan."));
  return unit;
}

/** The unit's dividend by its formula (Liga: with the RAB Actual; Sekolah Bola: income − expense). */
export async function unitDividendValue(unit: Pick<UnitRow, "id" | "type" | "programWeeks">) {
  if (unit.type === "liga") return unitFigures(await ligaDataset(unit.id, unit.programWeeks)).dividend.value;
  const school = await schoolDataset(unit.id);
  return schoolFigures({ students: school.students.length, payments: school.payments, expenses: school.expenses }).dividend;
}

/** Owner only: marks the league event as finished (the Liga dividend now exists) or opens it again. */
export async function setLeagueFinished(t: TFunction, unitId: string, finished: boolean) {
  const unit = await loadUnit(t, unitId);
  if (unit.type !== "liga") throw new UnitRuleError(t("Hanya unit Liga yang punya event liga."));
  const owners = await db.select({ taken: finUnitOwners.takenAmount }).from(finUnitOwners).where(eq(finUnitOwners.businessUnitId, unitId));
  if (!finished && owners.some((o) => o.taken > 0)) {
    throw new UnitRuleError(t("Dividen liga ini sudah diambil, jadi event liga tidak bisa dibuka kembali. Batalkan dulu pengambilannya."));
  }
  await db.update(businessUnits).set({ leagueFinishedOn: finished ? today() : null }).where(eq(businessUnits.id, unitId));
  return { unit, finished };
}

/**
 * Owner only: sets how much of their share each owner has taken. `taken` is posted per owner id.
 * Liga: an owner has either taken everything or nothing (and only after the league is finished).
 * Sekolah Bola: any amount from 0 to the share.
 */
export async function saveDividendTaken(t: TFunction, unitId: string, posted: ReadonlyMap<string, number>) {
  const unit = await loadUnit(t, unitId);
  if (unit.type === "liga" && !unit.leagueFinishedOn) {
    throw new UnitRuleError(t("Dividen Liga baru bisa diambil setelah event liga ditandai selesai."));
  }
  const owners = await db.select().from(finUnitOwners).where(eq(finUnitOwners.businessUnitId, unitId)).orderBy(asc(finUnitOwners.position), asc(finUnitOwners.createdAt));
  const dividend = await unitDividendValue(unit);
  const payouts = ownerPayouts(dividend, owners);

  const errors: Record<string, string> = {};
  const changes: { id: string; name: string; from: number; to: number }[] = [];
  owners.forEach((owner, i) => {
    if (!posted.has(owner.id)) return;
    const to = posted.get(owner.id)!;
    const limit = maxTaken(payouts[i].share);
    if (!Number.isInteger(to) || to < 0) errors[`taken-${owner.id}`] = t("Jumlah yang diambil tidak valid");
    else if (to > limit) errors[`taken-${owner.id}`] = t("Melebihi bagian dividen ({share})", { share: limit.toLocaleString("id-ID") });
    else if (unit.type === "liga" && to !== 0 && to !== limit) errors[`taken-${owner.id}`] = t("Dividen Liga hanya bisa diambil seluruhnya");
    if (to !== owner.takenAmount) changes.push({ id: owner.id, name: owner.name, from: owner.takenAmount, to });
  });
  if (Object.keys(errors).length) throw new UnitRuleError(t("Periksa kembali jumlah yang diambil."), errors);

  if (changes.length) {
    await db.transaction(async (tx) => {
      for (const c of changes) await tx.update(finUnitOwners).set({ takenAmount: c.to, takenOn: c.to > 0 ? today() : null }).where(eq(finUnitOwners.id, c.id));
    });
  }
  return { unit, changes };
}
