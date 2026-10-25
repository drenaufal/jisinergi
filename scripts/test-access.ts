/**
 * Who may do what, and which menus each kind of person and unit gets. No database needed.
 * Run with `npm run test:access`.
 */
import { ROLES, ROLE_LABEL, can, isRole, type Capability } from "@/lib/auth/rbac";
import { buildNav, homeFor } from "@/lib/nav";
import { canTouchUnit, scopeOf } from "@/lib/finance/scope";
import { UNIT_KINDS, UNIT_MENUS, UNIT_TYPES, menuHref } from "@/lib/finance/unit-types";
import { FINANCE_KINDS } from "@/lib/finance/entities";

let failures = 0;
const ok = (cond: unknown, label: string) => {
  if (!cond) failures++;
  console.log(`${cond ? "✓" : "✗"} ${label}`);
};
const eq = (actual: unknown, expected: unknown, label: string) => {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  if (!same) console.log(`   expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  ok(same, label);
};

/* ── Roles ── */
eq([...ROLES], ["owner", "unit_admin"], "two roles: owner and unit_admin");
eq([ROLE_LABEL.owner, ROLE_LABEL.unit_admin], ["Owner", "Admin Unit Bisnis"], "role labels");
ok(isRole("owner") && isRole("unit_admin") && !isRole("super_admin") && !isRole(undefined), "isRole only accepts the two roles");

const ALL: Capability[] = ["all-units", "input", "delete", "units:manage", "audit:view"];
ok(ALL.every((c) => can("owner", c)), "the owner holds every capability");
eq(ALL.filter((c) => can("unit_admin", c)), ["input"], "a unit admin may only input (and view their own unit)");
ok(!can(null, "input") && !can(undefined, "input"), "nobody signed in may do anything");

/* ── Scope ── */
const owner = scopeOf({ role: "owner", unitId: null });
const adminA = scopeOf({ role: "unit_admin", unitId: "unit-a" });
const orphan = scopeOf({ role: "unit_admin", unitId: null });
eq(owner, { allUnits: true, unitId: null }, "the owner sees every unit");
eq(adminA, { allUnits: false, unitId: "unit-a" }, "a unit admin is pinned to their unit");
eq(scopeOf({ role: "owner", unitId: "unit-a" }), { allUnits: true, unitId: null }, "an owner's own unit link is irrelevant");
ok(canTouchUnit(owner, "unit-a") && canTouchUnit(owner, "unit-b"), "the owner may open any unit");
ok(canTouchUnit(adminA, "unit-a") && !canTouchUnit(adminA, "unit-b"), "a unit admin may open only their unit");
ok(!canTouchUnit(orphan, "unit-a") && !canTouchUnit(owner, null) && !canTouchUnit(adminA, undefined), "nobody touches “no unit”; an unlinked admin touches nothing");

/* ── Unit types and their menus ── */
eq([...UNIT_TYPES], ["liga", "sekolah_bola"], "two unit types");
eq(UNIT_MENUS.liga.map((m) => m.slug), ["aset", "dividen", "modal", "match-fee", "registrasi", "rab"], "Liga menus: Aset, Dividen, Modal, Match Fee, Registrasi, RAB");
eq(UNIT_MENUS.sekolah_bola.map((m) => m.slug), ["pemasukan", "pengeluaran"], "Sekolah Bola menus: Pemasukan, Pengeluaran");
eq(UNIT_KINDS.liga, ["asset", "capital", "dividend", "registration", "matchfee", "budget"], "Liga holds the six original kinds of data");
eq(UNIT_KINDS.sekolah_bola, ["student", "payment", "expense"], "Sekolah Bola holds students, payments and expenses");
ok(FINANCE_KINDS.every((k) => UNIT_KINDS.liga.includes(k) !== UNIT_KINDS.sekolah_bola.includes(k)), "every kind of data belongs to exactly one unit type");
eq(menuHref("LIGA-1", "aset"), "/u/LIGA-1/aset", "menu links are /u/<code>/<menu>");

/* ── Navigation ── */
const units = [
  { code: "LIGA-1", name: "Liga Satu", type: "liga" as const, active: true },
  { code: "SB-1", name: "Sekolah Satu", type: "sekolah_bola" as const, active: true },
  { code: "SB-2", name: "Sekolah Dua", type: "sekolah_bola" as const, active: false },
];
const ownerNav = buildNav({ role: "owner" }, units);
eq(ownerNav.general.map((l) => l.href), ["/ringkasan", "/unit", "/audit"], "owner: overview, unit management, audit trail");
eq(ownerNav.units.map((u) => u.code), ["LIGA-1", "SB-1", "SB-2"], "owner: every unit");
eq(ownerNav.units[0].links.length, 7, "a Liga unit: summary + six menus");
eq(ownerNav.units[1].links.map((l) => l.label), ["Ringkasan unit", "Pemasukan", "Pengeluaran"], "a Sekolah Bola unit: summary + Pemasukan + Pengeluaran");
ok(ownerNav.units.every((u) => u.links[0].href === `/u/${u.code}`), "the first link of a unit is its summary");

const adminNav = buildNav({ role: "unit_admin" }, [units[1]]);
eq(adminNav.general, [], "a unit admin has no owner pages");
eq(adminNav.units.map((u) => u.code), ["SB-1"], "a unit admin sees only their unit");

eq(homeFor({ role: "owner" }), "/ringkasan", "the owner starts at the overview");
eq(homeFor({ role: "unit_admin", unitCode: "SB-1" }), "/u/SB-1", "a unit admin starts at their unit");
eq(homeFor({ role: "unit_admin", unitCode: null }), "/tanpa-akses", "an unlinked unit admin gets the explanation page");

console.log(failures ? `\n${failures} check(s) failed` : "\nAll access checks passed");
process.exit(failures ? 1 : 0);
