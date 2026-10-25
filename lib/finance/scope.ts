/**
 * Who may see or write which unit's data. These rules are pure (no database) so they can be tested
 * on their own; lib/finance/access.ts looks up the person's unit and feeds them in.
 *
 *   - the owner sees and edits every unit
 *   - a unit admin is pinned to the unit it belongs to — anything else is refused, never trusted from the URL
 *   - a unit admin that belongs to no unit can touch nothing
 */

import { can, type Role } from "@/lib/auth/rbac";

export type FinanceScope = {
  /** The owner: every unit. */
  allUnits: boolean;
  /** The unit this login belongs to (null for the owner and for logins without a unit). */
  unitId: string | null;
};

/** May this person see, create, change or delete data of `unitId`? */
export function canTouchUnit(scope: FinanceScope, unitId: string | null | undefined): boolean {
  if (!unitId) return false;
  return scope.allUnits || scope.unitId === unitId;
}

/** Role + unit membership → what the person may touch. The owner ignores any unit link. */
export const scopeOf = (user: { role: Role; unitId: string | null }): FinanceScope => ({
  allUnits: can(user.role, "all-units"),
  unitId: can(user.role, "all-units") ? null : user.unitId,
});
