"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Building2,
  Calculator,
  ChevronDown,
  ClipboardList,
  HandCoins,
  Landmark,
  LayoutDashboard,
  LogOut,
  Package,
  ScrollText,
  Target,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/app/(app)/actions";
import type { NavLink, NavModel, NavUnit } from "@/lib/nav";
import { ROLE_LABEL, type Role } from "@/lib/auth/rbac";
import { UNIT_TYPE_LABEL } from "@/lib/finance/unit-types";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "/ringkasan": Target,
  "/unit": Building2,
  "/audit": ScrollText,
  aset: Package,
  dividen: HandCoins,
  modal: Landmark,
  "match-fee": Ticket,
  registrasi: ClipboardList,
  rab: Calculator,
  pemasukan: ArrowDownToLine,
  pengeluaran: ArrowUpFromLine,
};

export type ShellUser = { name: string; email: string; role: Role; title?: string | null };

const isActive = (pathname: string, href: string, exact = false) =>
  exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

function Item({ link, pathname, onNavigate, icon: Icon, exact }: { link: NavLink; pathname: string; onNavigate?: () => void; icon?: LucideIcon; exact?: boolean }) {
  const active = isActive(pathname, link.href, exact);
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors",
        active ? "bg-white font-semibold text-black" : "text-night-muted hover:bg-night-2 hover:text-white",
      )}
    >
      {Icon ? <Icon className="size-4 shrink-0" /> : <span className="size-4 shrink-0" />}
      <span className="truncate">{link.label}</span>
    </Link>
  );
}

function UnitGroup({ unit, pathname, onNavigate, alwaysOpen }: { unit: NavUnit; pathname: string; onNavigate?: () => void; alwaysOpen: boolean }) {
  const inside = isActive(pathname, unit.href);
  const [picked, setPicked] = React.useState<boolean | null>(null);
  const open = alwaysOpen || (picked ?? inside);
  return (
    <div className="border-t border-night-line first:border-t-0">
      <button
        type="button"
        onClick={() => setPicked(!open)}
        aria-expanded={open}
        disabled={alwaysOpen}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors",
          alwaysOpen ? "cursor-default" : "hover:bg-night-2",
          inside ? "text-white" : "text-night-muted",
        )}
      >
        <span className={cn("grid size-6 shrink-0 place-items-center border text-[10px] font-bold", inside ? "border-white bg-white text-black" : "border-night-line")}>
          {unit.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{unit.name}</span>
          <span className="block text-[9.5px] uppercase tracking-[0.16em] opacity-70">
            {UNIT_TYPE_LABEL[unit.type]}
            {!unit.active && " · nonaktif"}
          </span>
        </span>
        {!alwaysOpen && <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} />}
      </button>
      {open && (
        <div className="mb-1.5 ml-[22px] border-l border-night-line pl-2">
          {unit.links.map((link, i) => (
            <Item key={link.href} link={link} pathname={pathname} onNavigate={onNavigate} icon={link.slug ? ICONS[link.slug] : LayoutDashboard} exact={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

/** The navigation list, user card and sign-out. Shared by the desktop sidebar and the mobile drawer. */
export function NavContent({ nav, user, onNavigate }: { nav: NavModel; user: ShellUser; onNavigate?: () => void }) {
  const pathname = usePathname();
  const single = nav.units.length === 1 && nav.general.length === 0;
  const groups = (["liga", "sekolah_bola"] as const)
    .map((type) => ({ type, units: nav.units.filter((u) => u.type === type) }))
    .filter((g) => g.units.length);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-2">
        {nav.general.length > 0 && (
          <div className="mb-3">
            <p className="px-3 pb-1.5 pt-2 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-night-muted/70">Owner</p>
            {nav.general.map((link) => (
              <Item key={link.href} link={link} pathname={pathname} onNavigate={onNavigate} icon={ICONS[link.href]} />
            ))}
          </div>
        )}

        {nav.units.length === 0 && <p className="px-3 py-4 text-xs text-night-muted">Belum ada unit bisnis.</p>}

        {groups.map((g) => (
          <div key={g.type} className="mb-3">
            <p className="px-3 pb-1.5 pt-2 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-night-muted/70">
              {single ? "Unit bisnis Anda" : `${UNIT_TYPE_LABEL[g.type]} · ${g.units.length}`}
            </p>
            <div className="border border-night-line">
              {g.units.map((u) => (
                <UnitGroup key={u.code} unit={u} pathname={pathname} onNavigate={onNavigate} alwaysOpen={single} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-night-line p-3">
        <div className="mb-2 min-w-0">
          <p className="truncate text-[13px] font-semibold text-white">{user.name}</p>
          <p className="truncate text-[11px] text-night-muted">
            {ROLE_LABEL[user.role]} · {user.email}
          </p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 border border-night-line px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white hover:text-black"
          >
            <LogOut className="size-3.5" /> Keluar
          </button>
        </form>
      </div>
    </div>
  );
}
