import type { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { businessUnitMembers, businessUnits, users } from "@/lib/db/schema";
import type { TFunction } from "@/lib/i18n/translate";
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

export async function createUnit(t: TFunction, input: z.output<ReturnType<typeof makeNewUnitSchema>>) {
  const taken = await db.select({ id: businessUnits.id }).from(businessUnits).where(eq(businessUnits.code, input.code)).limit(1);
  if (taken.length) throw new UnitRuleError(t("Periksa kembali isian formulir."), { code: t("Kode sudah dipakai unit lain") });
  const id = crypto.randomUUID();
  try {
    await db.insert(businessUnits).values({ id, ...input });
  } catch (error) {
    if (duplicate(error)) throw new UnitRuleError(t("Periksa kembali isian formulir."), { code: t("Kode sudah dipakai unit lain") });
    throw error;
  }
  return { id, ...input };
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
