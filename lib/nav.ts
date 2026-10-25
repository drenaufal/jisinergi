import { can, type Role } from "@/lib/auth/rbac";
import { UNIT_MENUS, menuHref, type UnitType } from "@/lib/finance/unit-types";

export type NavLink = { href: string; label: string; hint?: string; slug?: string };

export type NavUnit = {
  code: string;
  name: string;
  type: UnitType;
  active: boolean;
  /** The unit's own summary page. */
  href: string;
  links: NavLink[];
};

export type NavModel = {
  /** Pages that are not about one unit (owner only). */
  general: NavLink[];
  units: NavUnit[];
};

/**
 * The navigation one person sees. The owner gets the overview pages plus every unit; a unit admin
 * gets only their own unit and its menus. A unit's menus come from its type (lib/finance/unit-types.ts).
 */
export function buildNav(
  user: { role: Role },
  units: readonly { code: string; name: string; type: UnitType; active: boolean }[],
): NavModel {
  const general: NavLink[] = [];
  if (can(user.role, "all-units")) general.push({ href: "/ringkasan", label: "Ringkasan Owner", hint: "Dividen dan target" });
  if (can(user.role, "units:manage")) general.push({ href: "/unit", label: "Kelola Unit Bisnis", hint: "Unit dan akun login" });
  if (can(user.role, "audit:view")) general.push({ href: "/audit", label: "Jejak Audit", hint: "Riwayat perubahan data" });

  return {
    general,
    units: units.map((u) => ({
      code: u.code,
      name: u.name,
      type: u.type,
      active: u.active,
      href: menuHref(u.code),
      links: [
        { href: menuHref(u.code), label: "Ringkasan unit", hint: "Angka dan grafik unit ini" },
        ...UNIT_MENUS[u.type].map((m) => ({ href: menuHref(u.code, m.slug), label: m.label, hint: m.hint, slug: m.slug })),
      ],
    })),
  };
}

/** Where a person lands after signing in. */
export function homeFor(user: { role: Role; unitCode?: string | null }) {
  if (can(user.role, "all-units")) return "/ringkasan";
  return user.unitCode ? menuHref(user.unitCode) : "/tanpa-akses";
}
