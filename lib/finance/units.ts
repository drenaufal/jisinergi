import type { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { businessUnitMembers, businessUnits, finCapital, finUnitOwners, users } from "@/lib/db/schema";
import { APP_TIME_ZONE } from "@/lib/i18n/format";
import type { TFunction } from "@/lib/i18n/translate";
import type { OwnerInput } from "./ownership";
import { makeEditLoginSchema, makeEditUnitSchema, makeNewLoginSchema, makeNewUnitSchema } from "./unit-schemas";

export { makeEditLoginSchema, makeEditUnitSchema, makeNewLoginSchema, makeNewUnitSchema };

/* Business units and their logins — managed by the owner (capability "units:manage"). */

export class UserEmailExists extends Error {
  constructor(t: TFunction) {
    super(t("Email sudah terdaftar."));
  }
}

function duplicate(error: unknown) {
  const e = error as { code?: string; cause?: { code?: string } };
  return e.code === "ER_DUP_ENTRY" || e.cause?.code === "ER_DUP_ENTRY";
}

export class UnitRuleError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

const ownerRows = (unitId: string, owners: readonly Pick<OwnerInput, "name" | "shareBp">[]) =>
  owners.map((o, i) => ({ id: crypto.randomUUID(), businessUnitId: unitId, name: o.name, shareBp: o.shareBp, position: i + 1 }));

/**
 * Creates the unit with its owners in one transaction. A Sekolah Bola also records the modal each owner
 * put in (when they entered an amount); a Liga ignores it, its modal is kept in the Modal menu.
 */
export async function createUnit(t: TFunction, input: z.output<ReturnType<typeof makeNewUnitSchema>>, actorId: string | null = null) {
  const taken = await db.select({ id: businessUnits.id }).from(businessUnits).where(eq(businessUnits.code, input.code)).limit(1);
  if (taken.length) throw new UnitRuleError(t("Periksa kembali isian formulir."), { code: t("Kode sudah dipakai unit lain") });
  const id = crypto.randomUUID();
  const { owners, ...unit } = input;
  const isSchool = unit.type === "sekolah_bola";
  try {
    await db.transaction(async (tx) => {
      await tx.insert(businessUnits).values({ id, ...unit, programStartsOn: isSchool ? null : unit.programStartsOn });
      await tx.insert(finUnitOwners).values(ownerRows(id, owners));
      const today = new Date().toLocaleDateString("sv-SE", { timeZone: APP_TIME_ZONE });
      const capital = isSchool ? owners.filter((o) => o.capital > 0) : [];
      if (capital.length) {
        await tx.insert(finCapital).values(
          capital.map((o) => ({ id: crypto.randomUUID(), businessUnitId: id, createdBy: actorId, ownerName: o.name, amount: o.capital, status: "outstanding" as const, investedOn: today })),
        );
      }
    });
  } catch (error) {
    if (duplicate(error)) throw new UnitRuleError(t("Periksa kembali isian formulir."), { code: t("Kode sudah dipakai unit lain") });
    throw error;
  }
  return { id, ...input };
}

/** Replaces a unit's owners and shares (the owner list is small, so it is rewritten as a whole). */
export async function replaceUnitOwners(t: TFunction, unitId: string, owners: readonly Pick<OwnerInput, "name" | "shareBp">[]) {
  const [unit] = await db.select({ id: businessUnits.id, name: businessUnits.name }).from(businessUnits).where(eq(businessUnits.id, unitId));
  if (!unit) throw new UnitRuleError(t("Unit bisnis tidak ditemukan."));
  const before = await db.select({ name: finUnitOwners.name, shareBp: finUnitOwners.shareBp }).from(finUnitOwners).where(eq(finUnitOwners.businessUnitId, unitId)).orderBy(asc(finUnitOwners.position));
  await db.transaction(async (tx) => {
    await tx.delete(finUnitOwners).where(eq(finUnitOwners.businessUnitId, unitId));
    await tx.insert(finUnitOwners).values(ownerRows(unitId, owners));
  });
  return { unit, before, after: owners.map((o) => ({ name: o.name, shareBp: o.shareBp })) };
}

export async function updateUnit(t: TFunction, id: string, input: z.output<ReturnType<typeof makeEditUnitSchema>>) {
  const [before] = await db.select().from(businessUnits).where(eq(businessUnits.id, id));
  if (!before) throw new UnitRuleError(t("Unit bisnis tidak ditemukan."));
  await db.update(businessUnits).set(input).where(eq(businessUnits.id, id));
  return { before, after: { ...before, ...input } };
}

/** Creates a login (role Admin Unit Bisnis) and links it to the unit in one transaction. */
export async function createUnitLogin(t: TFunction, unitId: string, input: z.output<ReturnType<typeof makeNewLoginSchema>>) {
  const [unit] = await db.select({ id: businessUnits.id, name: businessUnits.name }).from(businessUnits).where(eq(businessUnits.id, unitId));
  if (!unit) throw new UnitRuleError(t("Unit bisnis tidak ditemukan."));
  if (await db.query.users.findFirst({ where: eq(users.email, input.email), columns: { id: true } })) throw new UserEmailExists(t);
  const id = crypto.randomUUID();
  const passwordHash = await hash(input.password, 12);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id,
        name: input.name,
        email: input.email,
        passwordHash,
        role: "unit_admin",
        title: `Admin ${unit.name}`,
        active: true,
      });
      await tx.insert(businessUnitMembers).values({ userId: id, businessUnitId: unit.id });
    });
  } catch (error) {
    if (duplicate(error)) throw new UserEmailExists(t);
    throw error;
  }
  return { id, name: input.name, email: input.email, unit: unit.name };
}

export async function updateUnitLogin(t: TFunction, userId: string, input: z.output<ReturnType<typeof makeEditLoginSchema>>) {
  const before = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, name: true, email: true, role: true, active: true },
  });
  if (!before || before.role !== "unit_admin") throw new UnitRuleError(t("Akun tidak ditemukan."));
  if (input.email !== before.email) {
    const taken = await db.query.users.findFirst({ where: eq(users.email, input.email), columns: { id: true } });
    if (taken && taken.id !== userId) throw new UserEmailExists(t);
  }
  const passwordHash = input.password ? await hash(input.password, 12) : undefined;
  try {
    await db
      .update(users)
      .set({ name: input.name, email: input.email, active: input.active, ...(passwordHash ? { passwordHash } : {}) })
      .where(eq(users.id, userId));
  } catch (error) {
    if (duplicate(error)) throw new UserEmailExists(t);
    throw error;
  }
  return { before, after: { name: input.name, email: input.email, active: input.active, passwordChanged: !!passwordHash } };
}

/** Every unit's owners with their shares, in the order they were entered. */
export async function listUnitOwners() {
  return db
    .select({ unitId: finUnitOwners.businessUnitId, name: finUnitOwners.name, shareBp: finUnitOwners.shareBp })
    .from(finUnitOwners)
    .orderBy(asc(finUnitOwners.position), asc(finUnitOwners.createdAt));
}

/** Every unit login with the unit it belongs to. */
export async function listUnitLogins() {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      active: users.active,
      unitId: businessUnitMembers.businessUnitId,
    })
    .from(businessUnitMembers)
    .innerJoin(users, eq(users.id, businessUnitMembers.userId))
    .orderBy(asc(users.name));
}
