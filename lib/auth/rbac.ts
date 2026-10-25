/**
 * Two roles:
 *
 *   owner       sees every business unit, owns the dividend target, creates units and their logins,
 *               may delete rows and read the audit trail.
 *   unit_admin  belongs to exactly one business unit and can only view and input that unit's data.
 *
 * Which unit a unit_admin belongs to is not a permission but a membership (business_unit_members);
 * lib/finance/scope.ts turns role + membership into "what may this person touch".
 */
export type Role = "owner" | "unit_admin";

export const ROLES: readonly Role[] = ["owner", "unit_admin"];

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  unit_admin: "Admin Unit Bisnis",
};

export type Capability =
  /** Sees every unit instead of just its own. */
  | "all-units"
  /** Adds and corrects rows. */
  | "input"
  /** Deletes rows. */
  | "delete"
  /** Creates units and their logins. */
  | "units:manage"
  /** Reads the audit trail. */
  | "audit:view";

const GRANTS: Record<Role, readonly Capability[]> = {
  owner: ["all-units", "input", "delete", "units:manage", "audit:view"],
  unit_admin: ["input"],
};

export const isRole = (value: unknown): value is Role => typeof value === "string" && (ROLES as readonly string[]).includes(value);

export function can(role: Role | null | undefined, capability: Capability): boolean {
  return !!role && GRANTS[role].includes(capability);
}
