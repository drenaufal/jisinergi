import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessUnits, finOwners, finSavings, finUnitOwners } from "@/lib/db/schema";
import { auditText, recordAudit } from "@/lib/audit";
import type { TFunction } from "@/lib/i18n/translate";
import { FinanceRuleError, type Actor } from "./records";

export type GlobalOwnerItem = {
  id: string;
  name: string;
  active: boolean;
  createdAt: Date;
  unitsCount: number;
  totalTaken: number;
  maxShareBp: number;
  savingsCount: number;
  canDelete: boolean;
  deleteBlockReason: string | null;
};

const ownerKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** Returns all registered owners with unit links and financial guard statuses. */
export async function listGlobalOwners(): Promise<GlobalOwnerItem[]> {
  const [owners, unitOwners, savings] = await Promise.all([
    db.select().from(finOwners).orderBy(asc(finOwners.name)),
    db.select().from(finUnitOwners),
    db.select({ name: finSavings.name }).from(finSavings),
  ]);

  return owners.map((owner) => {
    const key = ownerKey(owner.name);
    const matchedUOs = unitOwners.filter((uo) => ownerKey(uo.name) === key);
    const unitsCount = matchedUOs.length;
    const totalTaken = matchedUOs.reduce((sum, uo) => sum + uo.takenAmount, 0);
    const maxShareBp = matchedUOs.reduce((max, uo) => Math.max(max, uo.shareBp), 0);
    const savingsCount = savings.filter((s) => ownerKey(s.name) === key).length;

    let canDelete = true;
    let deleteBlockReason: string | null = null;

    if (totalTaken > 0) {
      canDelete = false;
      deleteBlockReason = `Sudah mencairkan dividen Rp ${totalTaken.toLocaleString("id-ID")}`;
    } else if (maxShareBp > 0) {
      canDelete = false;
      deleteBlockReason = `Masih memiliki alokasi dividen aktif (${(maxShareBp / 100).toFixed(2).replace(/\.00$/, "")}%)`;
    } else if (savingsCount > 0) {
      canDelete = false;
      deleteBlockReason = `Memiliki ${savingsCount} catatan di halaman Nabung`;
    }

    return {
      id: owner.id,
      name: owner.name,
      active: owner.active,
      createdAt: owner.createdAt,
      unitsCount,
      totalTaken,
      maxShareBp,
      savingsCount,
      canDelete,
      deleteBlockReason,
    };
  });
}

/** Adds an owner and syncs into every business unit's fin_unit_owners with shareBp = 0 and inOverview = true. */
export async function createGlobalOwner(t: TFunction, actor: Actor, name: string) {
  const cleanName = name.trim().replace(/\s+/g, " ");
  if (!cleanName || cleanName.length < 1) {
    throw new FinanceRuleError(t("Periksa kembali isian formulir."), { name: t("Nama pemilik wajib diisi") });
  }
  if (cleanName.length > 120) {
    throw new FinanceRuleError(t("Periksa kembali isian formulir."), { name: t("Maksimal {n} karakter", { n: 120 }) });
  }

  const [existing] = await db
    .select({ id: finOwners.id, name: finOwners.name })
    .from(finOwners)
    .where(eq(sql`LOWER(${finOwners.name})`, cleanName.toLowerCase()))
    .limit(1);

  if (existing) {
    throw new FinanceRuleError(t("Periksa kembali isian formulir."), {
      name: t("Nama owner “{name}” sudah terdaftar.", { name: cleanName }),
    });
  }

  const ownerId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(finOwners).values({
      id: ownerId,
      name: cleanName,
      active: true,
    });

    const units = await tx.select({ id: businessUnits.id }).from(businessUnits);
    const existingUnitOwners = await tx.select().from(finUnitOwners);

    for (const unit of units) {
      const inThisUnit = existingUnitOwners.filter((uo) => uo.businessUnitId === unit.id);
      const alreadyThere = inThisUnit.some((uo) => ownerKey(uo.name) === cleanName.toLowerCase());
      if (!alreadyThere) {
        const nextPos = Math.max(0, ...inThisUnit.map((uo) => uo.position)) + 1;
        await tx.insert(finUnitOwners).values({
          id: crypto.randomUUID(),
          businessUnitId: unit.id,
          name: cleanName,
          shareBp: 0,
          position: nextPos,
          takenAmount: 0,
          inOverview: true,
        });
      }
    }
  });

  await recordAudit({
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: "finance.owner.create",
    entityType: "fin_owner",
    entityId: ownerId,
    summary: auditText("Data Owner — tambah pemilik baru: {name}", { name: cleanName }),
  });

  return { id: ownerId, name: cleanName };
}

/** Renames an owner across fin_owners, fin_unit_owners, and fin_savings. */
export async function renameGlobalOwner(t: TFunction, actor: Actor, id: string, newName: string) {
  const cleanName = newName.trim().replace(/\s+/g, " ");
  if (!cleanName || cleanName.length < 1) {
    throw new FinanceRuleError(t("Periksa kembali isian formulir."), { name: t("Nama pemilik wajib diisi") });
  }
  if (cleanName.length > 120) {
    throw new FinanceRuleError(t("Periksa kembali isian formulir."), { name: t("Maksimal {n} karakter", { n: 120 }) });
  }

  const [current] = await db.select().from(finOwners).where(eq(finOwners.id, id));
  if (!current) throw new FinanceRuleError(t("Data owner tidak ditemukan."));

  if (ownerKey(current.name) !== cleanName.toLowerCase()) {
    const [duplicate] = await db
      .select({ id: finOwners.id })
      .from(finOwners)
      .where(and(eq(sql`LOWER(${finOwners.name})`, cleanName.toLowerCase()), ne(finOwners.id, id)))
      .limit(1);

    if (duplicate) {
      throw new FinanceRuleError(t("Periksa kembali isian formulir."), {
        name: t("Nama owner “{name}” sudah terdaftar.", { name: cleanName }),
      });
    }
  }

  const oldKey = ownerKey(current.name);

  await db.transaction(async (tx) => {
    await tx.update(finOwners).set({ name: cleanName, updatedAt: new Date() }).where(eq(finOwners.id, id));

    const allUnitOwners = await tx.select({ id: finUnitOwners.id, name: finUnitOwners.name }).from(finUnitOwners);
    const toUpdateUO = allUnitOwners.filter((uo) => ownerKey(uo.name) === oldKey);
    for (const uo of toUpdateUO) {
      await tx.update(finUnitOwners).set({ name: cleanName }).where(eq(finUnitOwners.id, uo.id));
    }

    const allSavings = await tx.select({ id: finSavings.id, name: finSavings.name }).from(finSavings);
    const toUpdateSavings = allSavings.filter((s) => ownerKey(s.name) === oldKey);
    for (const s of toUpdateSavings) {
      await tx.update(finSavings).set({ name: cleanName }).where(eq(finSavings.id, s.id));
    }
  });

  await recordAudit({
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: "finance.owner.rename",
    entityType: "fin_owner",
    entityId: id,
    summary: auditText("Data Owner — ubah nama dari “{old}” menjadi “{new}”", { old: current.name, new: cleanName }),
  });

  return { id, name: cleanName };
}

/** Deletes an owner if they have no financial transactions or active shares. */
export async function deleteGlobalOwner(t: TFunction, actor: Actor, id: string) {
  const [current] = await db.select().from(finOwners).where(eq(finOwners.id, id));
  if (!current) throw new FinanceRuleError(t("Data owner tidak ditemukan."));

  const key = ownerKey(current.name);
  const allUnitOwners = await db.select().from(finUnitOwners);
  const matchedUnitOwners = allUnitOwners.filter((uo) => ownerKey(uo.name) === key);

  const takenTotal = matchedUnitOwners.reduce((sum, uo) => sum + uo.takenAmount, 0);
  if (takenTotal > 0) {
    throw new FinanceRuleError(
      t("“{name}” sudah pernah mencairkan dividen senilai Rp {amount}, sehingga tidak dapat dihapus demi integritas pembukuan.", {
        name: current.name,
        amount: takenTotal.toLocaleString("id-ID"),
      }),
    );
  }

  const activeShare = matchedUnitOwners.find((uo) => uo.shareBp > 0);
  if (activeShare) {
    throw new FinanceRuleError(
      t("“{name}” masih memiliki alokasi dividen aktif ({share}%). Harap ubah alokasinya menjadi 0% terlebih dahulu di menu Dividen unit terkait.", {
        name: current.name,
        share: (activeShare.shareBp / 100).toFixed(2).replace(/\.00$/, ""),
      }),
    );
  }

  const allSavings = await db.select({ id: finSavings.id, name: finSavings.name }).from(finSavings);
  const matchedSavings = allSavings.filter((s) => ownerKey(s.name) === key);
  if (matchedSavings.length > 0) {
    throw new FinanceRuleError(
      t("“{name}” memiliki {count} catatan transaksi di halaman Nabung. Hapus atau sesuaikan catatan tabungannya terlebih dahulu.", {
        name: current.name,
        count: matchedSavings.length,
      }),
    );
  }

  await db.transaction(async (tx) => {
    for (const uo of matchedUnitOwners) {
      await tx.delete(finUnitOwners).where(eq(finUnitOwners.id, uo.id));
    }
    await tx.delete(finOwners).where(eq(finOwners.id, id));
  });

  await recordAudit({
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: "finance.owner.delete",
    entityType: "fin_owner",
    entityId: id,
    summary: auditText("Data Owner — hapus pemilik: {name}", { name: current.name }),
  });

  return { id, name: current.name };
}
