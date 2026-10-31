import { and, eq, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  businessUnits,
  finActualItems,
  finAssets,
  finBudgetItems,
  finCapital,
  finMatchFees,
  finRegistrations,
  finStudentPayments,
  finStudents,
} from "@/lib/db/schema";
import { auditText, recordAudit } from "@/lib/audit";
import { releaseMedia, releaseReplaced } from "@/lib/media-store";
import { APP_TIME_ZONE } from "@/lib/i18n/format";
import type { TFunction } from "@/lib/i18n/translate";
import { budgetLineProgramTotal } from "./calc";
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
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const todayInApp = () => new Date().toLocaleDateString("sv-SE", { timeZone: APP_TIME_ZONE });

async function unitName(unitId: string) {
  const [row] = await db.select({ name: businessUnits.name }).from(businessUnits).where(eq(businessUnits.id, unitId));
  return row?.name ?? "—";
}

const hasCode = (error: unknown, code: string) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return e.code === code || e.cause?.code === code;
};
const isDuplicate = (error: unknown) => hasCode(error, "ER_DUP_ENTRY");
/** A row other rows still point at (e.g. a RAB line that has real costs). */
const isReferenced = (error: unknown) => hasCode(error, "ER_ROW_IS_REFERENCED_2");

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
          eq(finRegistrations.ageGroup, values.ageGroup ?? ""),
          eq(finRegistrations.clubName, values.clubName),
          exceptId ? ne(finRegistrations.id, exceptId) : undefined,
        ),
      )
      .limit(1);
    if (hit.length) {
      throw new FinanceRuleError(t("Periksa kembali isian formulir."), {
        clubName: values.ageGroup ? t("Klub ini sudah terdaftar di kelompok {group} — ubah barisnya saja.", { group: values.ageGroup }) : t("Klub ini sudah punya data registrasi — ubah barisnya saja."),
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
          eq(finMatchFees.ageGroup, values.ageGroup ?? ""),
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
  if (kind === "actualitem") {
    const sameLine = (table: typeof finBudgetItems | typeof finActualItems) =>
      and(eq(table.businessUnitId, unitId), sql`lower(${table.category}) = lower(${values.category})`, sql`lower(${table.name}) = lower(${values.name})`);
    const inRab = await db.select({ id: finBudgetItems.id }).from(finBudgetItems).where(sameLine(finBudgetItems)).limit(1);
    const extra = await db
      .select({ id: finActualItems.id })
      .from(finActualItems)
      .where(and(sameLine(finActualItems), exceptId ? ne(finActualItems.id, exceptId) : undefined))
      .limit(1);
    if (inRab.length || extra.length) {
      throw new FinanceRuleError(t("Periksa kembali isian formulir."), {
        name: inRab.length ? t("Biaya ini sudah ada di RAB — pilih dari daftar saat mencatat biaya actual.") : t("Keterangan biaya ini sudah ada di kategori tersebut."),
      });
    }
  }
}

/** A real cost must point at a RAB line or an extra line of the same unit. */
async function assertCostTarget(t: TFunction, unitId: string, values: Row) {
  const [hit] = values.budgetItemId
    ? await db
        .select({ id: finBudgetItems.id })
        .from(finBudgetItems)
        .where(and(eq(finBudgetItems.id, values.budgetItemId), eq(finBudgetItems.businessUnitId, unitId)))
        .limit(1)
    : await db
        .select({ id: finActualItems.id })
        .from(finActualItems)
        .where(and(eq(finActualItems.id, values.actualItemId), eq(finActualItems.businessUnitId, unitId)))
        .limit(1);
  if (!hit) {
    throw new FinanceRuleError(t("Periksa kembali isian formulir."), { itemRef: t("Keterangan biaya tidak ditemukan di unit ini.") });
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
  const others = and(
    eq(finStudentPayments.studentId, values.studentId),
    ne(finStudentPayments.kind, "jersey"),
    exceptId ? ne(finStudentPayments.id, exceptId) : undefined,
  );
  /** The month a stored payment pays for: its period, or (old registrations) the month it was paid. */
  const covers = (period: string) =>
    or(eq(finStudentPayments.period, period), and(sql`${finStudentPayments.period} is null`, sql`date_format(${finStudentPayments.paidOn}, '%Y-%m') = ${period}`));

  if (values.kind === "registration") {
    const hit = await db.select({ id: finStudentPayments.id }).from(finStudentPayments).where(and(others, eq(finStudentPayments.kind, "registration"))).limit(1);
    if (hit.length) {
      throw new FinanceRuleError(t("Periksa kembali isian formulir."), {
        kind: t("Siswa ini sudah punya pembayaran registrasi — ubah barisnya saja."),
      });
    }
    const monthly = await db
      .select({ id: finStudentPayments.id })
      .from(finStudentPayments)
      .where(and(others, eq(finStudentPayments.kind, "monthly"), eq(finStudentPayments.period, values.period)))
      .limit(1);
    if (monthly.length) {
      throw new FinanceRuleError(t("Periksa kembali isian formulir."), {
        paidOn: t("Registrasi sudah termasuk iuran bulan {month}, dan iuran bulan itu sudah dicatat terpisah. Hapus iuran bulanannya dulu.", { month: values.period }),
      });
    }
  }
  if (values.kind === "monthly") {
    const hit = await db.select({ id: finStudentPayments.id }).from(finStudentPayments).where(and(others, covers(values.period))).limit(1);
    if (hit.length) {
      throw new FinanceRuleError(t("Periksa kembali isian formulir."), {
        period: t("Iuran bulan ini sudah tercatat untuk siswa tersebut (registrasi sudah termasuk iuran bulan pertamanya)."),
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

/** An expense marked "Aset" keeps one row in ASET in step with itself; any other expense has none. */
async function syncExpenseAsset(tx: Tx, input: { expenseId: string; unitId: string; actorId: string; row: Row }) {
  const { expenseId, unitId, actorId, row } = input;
  const [existing] = await tx.select({ id: finAssets.id }).from(finAssets).where(eq(finAssets.expenseId, expenseId)).limit(1);
  if (!row.isAsset) {
    if (existing) await tx.delete(finAssets).where(eq(finAssets.id, existing.id));
    return;
  }
  const values = {
    purchasedOn: row.spentOn,
    name: String(row.name).slice(0, 160),
    amount: row.amount,
    proofUrl: row.proofUrl ?? null,
    note: row.note ?? null,
  };
  if (existing) await tx.update(finAssets).set({ ...values, updatedAt: new Date() }).where(eq(finAssets.id, existing.id));
  else await tx.insert(finAssets).values({ id: crypto.randomUUID(), businessUnitId: unitId, createdBy: actorId, expenseId, ...values });
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
  let programWeeks = 10;
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
    const [unit] = await db
      .select({ id: businessUnits.id, active: businessUnits.active, programWeeks: businessUnits.programWeeks })
      .from(businessUnits)
      .where(eq(businessUnits.id, wanted));
    if (!unit || !canTouchUnit(scope, unit.id)) throw new FinanceRuleError(t("Unit bisnis tidak ditemukan."));
    if (!unit.active) throw new FinanceRuleError(t("Unit bisnis ini nonaktif."));
    unitId = unit.id;
    programWeeks = unit.programWeeks;
  }

  // A saved RAB line is final. An asset made from a RAB line or an expense follows its source.
  if (id && kind === "budget") throw new FinanceRuleError(t("Baris RAB yang sudah disimpan tidak dapat diubah."));
  if (id && kind === "asset" && (before?.budgetItemId || before?.expenseId)) {
    throw new FinanceRuleError(
      before.budgetItemId ? t("Aset ini dibuat otomatis dari RAB, jadi tidak dapat diubah di sini.") : t("Aset ini dibuat otomatis dari pengeluaran — ubah pengeluarannya."),
    );
  }

  await assertKindAllowed(t, unitId, kind);
  await assertNoDuplicate(t, kind, unitId, values, id ?? undefined);
  if (kind === "payment") await assertStudentPayment(t, unitId, values, id ?? undefined);
  if (kind === "actualcost") await assertCostTarget(t, unitId, values);
  const extras = kind === "budget" ? await budgetPlacement(unitId, values, before) : {};
  const row: Row = { ...values, ...extras };
  const rowId = id ?? crypto.randomUUID();

  try {
    await db.transaction(async (tx) => {
      if (id) {
        await tx.update(table).set({ ...row, updatedAt: new Date() }).where(eq(table.id, id));
      } else {
        await tx.insert(table).values({ id: rowId, businessUnitId: unitId, createdBy: actor.id, ...row });
      }
      if (kind === "budget" && row.isAsset) {
        // an asset line of the RAB also becomes an asset (worth the line's budget over the program)
        await tx.insert(finAssets).values({
          id: crypto.randomUUID(),
          businessUnitId: unitId,
          createdBy: actor.id,
          budgetItemId: rowId,
          purchasedOn: todayInApp(),
          name: String(row.name).slice(0, 160),
          amount: budgetLineProgramTotal({ period: row.period, quantity: row.quantity, unitPrice: row.unitPrice }, programWeeks),
          note: t("Dibuat otomatis dari RAB"),
        });
      }
      if (kind === "expense") await syncExpenseAsset(tx, { expenseId: rowId, unitId, actorId: actor.id, row });
    });
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
    entityId: rowId,
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
  if (kind === "asset" && (row.budgetItemId || row.expenseId)) {
    throw new FinanceRuleError(
      row.budgetItemId ? t("Aset ini dibuat otomatis dari RAB — hapus baris RABnya untuk menghapus aset ini.") : t("Aset ini dibuat otomatis dari pengeluaran — hapus pengeluarannya untuk menghapus aset ini."),
    );
  }

  const paymentProofs =
    kind === "student"
      ? (await db.select({ proofUrl: finStudentPayments.proofUrl }).from(finStudentPayments).where(eq(finStudentPayments.studentId, id))).map((p) => p.proofUrl)
      : [];
  try {
    await db.delete(table).where(eq(table.id, id));
  } catch (error) {
    if (isReferenced(error)) {
      throw new FinanceRuleError(t("Data ini sudah punya biaya actual — hapus biaya actualnya terlebih dahulu."));
    }
    throw error;
  }
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
