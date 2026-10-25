import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessUnits } from "@/lib/db/schema";
import { can } from "@/lib/auth/rbac";
import { requireUser, type CurrentUser } from "@/lib/auth/session";
import { canTouchUnit, scopeOf } from "./scope";
import { isUnitType, type UnitType } from "./unit-types";
import type { FormContext } from "@/app/(app)/u/[code]/forms";

export { scopeOf };

export type UnitInfo = {
  id: string;
  code: string;
  name: string;
  type: UnitType;
  description: string | null;
  programWeeks: number;
  active: boolean;
};

const unitColumns = {
  id: businessUnits.id,
  code: businessUnits.code,
  name: businessUnits.name,
  type: businessUnits.type,
  description: businessUnits.description,
  programWeeks: businessUnits.programWeeks,
  active: businessUnits.active,
};

/** The units this person may open: all of them for the owner, just their own for a unit admin. */
export const listVisibleUnits = cache(async (user: Pick<CurrentUser, "role" | "unitId">): Promise<UnitInfo[]> => {
  const scope = scopeOf(user);
  if (!scope.allUnits && !scope.unitId) return [];
  const rows = await db
    .select(unitColumns)
    .from(businessUnits)
    .where(scope.allUnits ? undefined : eq(businessUnits.id, scope.unitId!))
    .orderBy(asc(businessUnits.type), asc(businessUnits.name));
  return rows.filter((r): r is typeof r & { type: UnitType } => isUnitType(r.type));
});

export const getUnitByCode = cache(async (code: string): Promise<UnitInfo | null> => {
  const [row] = await db.select(unitColumns).from(businessUnits).where(eq(businessUnits.code, decodeURIComponent(code).toUpperCase())).limit(1);
  return row && isUnitType(row.type) ? { ...row, type: row.type } : null;
});

/**
 * What every page under /u/[code] needs before it renders: who is asking, which unit, and what they may do.
 * Unknown unit → 404. A unit the person may not open → back to their home with a notice. When `type` is
 * given, a unit of the other type has no such page → 404.
 */
export async function loadUnitPage(code: string, type?: UnitType) {
  const user = await requireUser();
  const unit = await getUnitByCode(code);
  if (!unit) notFound();
  const scope = scopeOf(user);
  if (!canTouchUnit(scope, unit.id)) redirect("/?denied=1");
  if (type && unit.type !== type) notFound();

  const canInput = can(user.role, "input") && unit.active;
  const canDelete = can(user.role, "delete");
  const form: FormContext = {
    unitId: unit.id,
    programWeeks: unit.programWeeks,
    canDelete,
  };
  return { user, unit, scope, form, canInput, canDelete, isOwner: scope.allUnits };
}

export type UnitPage = Awaited<ReturnType<typeof loadUnitPage>>;
