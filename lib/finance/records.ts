import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessUnits, finBudgetItems, finCapital, finMatchFees, finRegistrations, finStudentPayments, finStudents } from "@/lib/db/schema";
import { auditText, recordAudit } from "@/lib/audit";
import { releaseMedia, releaseReplaced } from "@/lib/media-store";
import type { TFunction } from "@/lib/i18n/translate";
import { ENTITIES, type FinanceKind } from "./entities";
import { canTouchUnit, type FinanceScope } from "./scope";
import { UNIT_KINDS, isUnitType } from "./unit-types";

/** A business rule the person can fix (shown next to the field or as a form message). */
export class FinanceRuleError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

export type Actor = { id: string; name: string; role: string };

/* The tables differ per kind, so the generic code below talks to them untyped; every value that
 * reaches it was validated by the kind's zod schema first. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

async function unitName(unitId: string) {
  const [row] = await db.select({ name: businessUnits.name }).from(businessUnits).where(eq(businessUnits.id, unitId));
  return row?.name ?? "—";
}

function isDuplicate(error: unknown) {
  const e = error as { code?: string; cause?: { code?: string } };
  return e.code === "ER_DUP_ENTRY" || e.cause?.code === "ER_DUP_ENTRY";
}

async function loadRow(kind: FinanceKind, id: string): Promise<Row | undefined> {
  const table = ENTITIES[kind].table as any;
  const [row] = await db.select().from(table).where(eq(table.id, id)).limit(1);
  return row;
}

/** RAB lines keep the order they were entered in; a new category goes to the end of its period. */
async function budgetPlacement(unitId: string, values: Row, before?: Row) {
  const siblings = await db
    .select({ category: finBudgetItems.category, categoryOrder: finBudgetItems.categoryOrder, itemOrder: finBudgetItems.itemOrder })
    .from(finBudgetItems)
    .where(and(eq(finBudgetItems.businessUnitId, unitId), eq(finBudgetItems.period, values.period)));
  const known = siblings.find((s) => s.category.toLowerCase() === String(values.category).toLowerCase());
  const category = known?.category ?? String(values.category);
  const categoryOrder = known?.categoryOrder ?? Math.max(0, ...siblings.map((s) => s.categoryOrder)) + 1;
  const sameGroup = before && before.period === values.period && before.category === category;
  const itemOrder = sameGroup
    ? before.itemOrder
    : Math.max(0, ...siblings.filter((s) => s.category === category).map((s) => s.itemOrder)) + 1;
  return { category, categoryOrder, itemOrder };
}

async function assertNoDuplicate(t: TFunction, kind: FinanceKind, unitId: string, values: Row, exceptId?: string) {
  if (kind === "registration") {
    const hit = await db
      .select({ id: finRegistrations.id })
      .from(finRegistrations)
      .where(
        and(
          eq(finRegistrations.businessUnitId, unitId),
          eq(finRegistrations.clubName, values.clubName),
          exceptId ? ne(finRegistrations.id, exceptId) : undefined,
        ),
      )
      .limit(1);
    if (hit.length) {
      throw new FinanceRuleError(t("Periksa kembali isian formulir."), {
        clubName: t("Klub ini sudah punya data registrasi — ubah barisnya saja."),
      });
    }
  }
  if (kind === "matchfee") {
    const hit = await db
      .select({ id: finMatchFees.id })
      .from(finMatchFees)
      .where(
        and(
          eq(finMatchFees.businessUnitId, unitId),
          eq(finMatchFees.clubName, values.clubName),
          eq(finMatchFees.week, values.week),
          exceptId ? ne(finMatchFees.id, exceptId) : undefined,
        ),
      )
      .limit(1);
    if (hit.length) {
      throw new FinanceRuleError(t("Periksa kembali isian formulir."), {
        week: t("Klub ini sudah punya match fee untuk minggu tersebut — ubah barisnya saja."),
      });
    }
  }
}

async function assertStudentPayment(t: TFunction, unitId: string, values: Row, exceptId?: string) {
  const [student] = await db
    .select({ id: finStudents.id })
    .from(finStudents)
    .where(and(eq(finStudents.id, values.studentId), eq(finStudents.businessUnitId, unitId)))
    .limit(1);
  if (!student) {
    throw new FinanceRuleError(t("Periksa kembali isian formulir."), { studentId: t("Siswa tidak ditemukan di unit ini.") });
  }
  const sameKind = and(
    eq(finStudentPayments.studentId, values.studentId),
    eq(finStudentPayments.kind, values.kind),
    exceptId ? ne(finStudentPayments.id, exceptId) : undefined,
  );
  if (values.kind === "registration") {
    const hit = await db.select({ id: finStudentPayments.id }).from(finStudentPayments).where(sameKind).limit(1);
    if (hit.length) {
      throw new FinanceRuleError(t("Periksa kembali isian formulir."), {
        kind: t("Siswa ini sudah punya pembayaran registrasi — ubah barisnya saja."),
      });
    }
  }
  if (values.kind === "monthly") {
    const hit = await db
      .select({ id: finStudentPayments.id })
      .from(finStudentPayments)
      .where(and(sameKind, eq(finStudentPayments.period, values.period)))
      .limit(1);
    if (hit.length) {
      throw new FinanceRuleError(t("Periksa kembali isian formulir."), {
        period: t("Iuran bulan ini sudah tercatat untuk siswa tersebut — ubah barisnya saja."),
      });
    }
  }
}

async function assertKindAllowed(t: TFunction, unitId: string, kind: FinanceKind) {
  const [unit] = await db.select({ type: businessUnits.type }).from(businessUnits).where(eq(businessUnits.id, unitId));
  if (!unit || !isUnitType(unit.type) || !UNIT_KINDS[unit.type].includes(kind)) {
    throw new FinanceRuleError(t("Jenis data ini tidak tersedia untuk tipe unit bisnis tersebut."));
  }
}

export async function saveFinanceRecord(input: {
  t: TFunction;
  actor: Actor;
  scope: FinanceScope;
  kind: FinanceKind;
  /** null = create. */
  id: string | null;
  /** The unit picked in the form (administrators only; a unit login is pinned to its own). */
  requestedUnitId: string | null;
  values: Row;
}) {
  const { t, actor, scope, kind, id, values } = input;
  const def = ENTITIES[kind];
  const table = def.table as any;

  let before: Row | undefined;
  let unitId: string;
  if (id) {
    before = await loadRow(kind, id);
    if (!before || !canTouchUnit(scope, before.businessUnitId)) throw new FinanceRuleError(t("Data tidak ditemukan."));
    unitId = before.businessUnitId;
  } else {
    const wanted = scope.allUnits ? input.requestedUnitId : scope.unitId;
    if (!wanted) {
      throw scope.allUnits
        ? new FinanceRuleError(t("Periksa kembali isian formulir."), { businessUnitId: t("Pilih unit bisnis") })
        : new FinanceRuleError(t("Akun Anda belum terhubung ke unit bisnis. Hubungi administrator."));
    }
    const [unit] = await db.select({ id: businessUnits.id, active: businessUnits.active }).from(businessUnits).where(eq(businessUnits.id, wanted));
    if (!unit || !canTouchUnit(scope, unit.id)) throw new FinanceRuleError(t("Unit bisnis tidak ditemukan."));
    if (!unit.active) throw new FinanceRuleError(t("Unit bisnis ini nonaktif."));
    unitId = unit.id;
  }

  await assertKindAllowed(t, unitId, kind);
  await assertNoDuplicate(t, kind, unitId, values, id ?? undefined);
  if (kind === "payment") await assertStudentPayment(t, unitId, values, id ?? undefined);
  const extras = kind === "budget" ? await budgetPlacement(unitId, values, before) : {};
  const row: Row = { ...values, ...extras };

  try {
    if (id) {
      await db.update(table).set({ ...row, updatedAt: new Date() }).where(eq(table.id, id));
    } else {
      await db.insert(table).values({ id: crypto.randomUUID(), businessUnitId: unitId, createdBy: actor.id, ...row });
    }
  } catch (error) {
    if (isDuplicate(error)) throw new FinanceRuleError(t("Data yang sama sudah ada."));
    throw error;
  }

  if (before) for (const key of def.proofs) await releaseReplaced(before[key], row[key]);

  await recordAudit({
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: `finance.${kind}.${id ? "update" : "create"}`,
    entityType: `finance_${kind}`,
    entityId: id ?? undefined,
    summary: auditText(id ? "Keuangan — {kind} diperbarui: {name} ({unit})" : "Keuangan — {kind} ditambahkan: {name} ({unit})", {
      kind: auditText(def.label),
      name: def.title(row),
      unit: await unitName(unitId),
    }),
  });

  return { unitId, created: !id, title: def.title(row) };
}

export async function deleteFinanceRecord(input: {
  t: TFunction;
  actor: Actor;
  scope: FinanceScope;
  kind: FinanceKind;
  id: string;
}) {
  const { t, actor, scope, kind, id } = input;
  const def = ENTITIES[kind];
  const table = def.table as any;
  const row = await loadRow(kind, id);
  if (!row || !canTouchUnit(scope, row.businessUnitId)) throw new FinanceRuleError(t("Data tidak ditemukan."));

  const paymentProofs =
    kind === "student"
      ? (await db.select({ proofUrl: finStudentPayments.proofUrl }).from(finStudentPayments).where(eq(finStudentPayments.studentId, id))).map((p) => p.proofUrl)
      : [];
  await db.delete(table).where(eq(table.id, id));
  await releaseMedia(...def.proofs.map((key) => row[key]), ...paymentProofs);

  await recordAudit({
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: `finance.${kind}.delete`,
    entityType: `finance_${kind}`,
    entityId: id,
    summary: auditText("Keuangan — {kind} dihapus: {name} ({unit})", {
      kind: auditText(def.label),
      name: def.title(row),
      unit: await unitName(row.businessUnitId),
    }),
  });
  return { title: def.title(row) };
}

/** One-click "Modal sudah kembali": status → returned, return date → today. */
export async function markCapitalReturned(input: { t: TFunction; actor: Actor; scope: FinanceScope; id: string }) {
  const { t, actor, scope, id } = input;
  const row = await loadRow("capital", id);
  if (!row || !canTouchUnit(scope, row.businessUnitId)) throw new FinanceRuleError(t("Data tidak ditemukan."));
  if (row.status === "returned") return { title: row.ownerName as string };

  await db
    .update(finCapital)
    .set({ status: "returned", returnedOn: row.returnedOn ?? new Date().toISOString().slice(0, 10), updatedAt: new Date() })
    .where(eq(finCapital.id, id));

  await recordAudit({
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: "finance.capital.returned",
    entityType: "finance_capital",
    entityId: id,
    summary: auditText("Keuangan — modal ditandai sudah kembali: {name} ({unit})", {
      name: row.ownerName,
      unit: await unitName(row.businessUnitId),
    }),
  });
  return { title: row.ownerName as string };
}
