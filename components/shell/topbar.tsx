"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import type { NavModel } from "@/lib/nav";
import { UNIT_TYPE_LABEL } from "@/lib/finance/unit-types";
import { useIsClient } from "@/components/ui/dialog";
import { NavContent, type ShellUser } from "./nav-content";

/** Works out "Unit · Halaman" from the URL so every page shows where it is. */
function useCrumbs(nav: NavModel) {
  const pathname = usePathname();
  const general = nav.general.find((l) => pathname === l.href || pathname.startsWith(l.href + "/"));
  if (general) return [general.label];
  const unit = nav.units.find((u) => pathname === u.href || pathname.startsWith(u.href + "/"));
  if (!unit) return [];
  const link = [...unit.links].reverse().find((l) => pathname === l.href || pathname.startsWith(l.href + "/"));
  return [unit.name, link && link.href !== unit.href ? link.label : "Ringkasan unit"];
}

export function Topbar({ nav, user, home }: { nav: NavModel; user: ShellUser; home: string }) {
  const crumbs = useCrumbs(nav);
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const mounted = useIsClient();
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const unit = nav.units.find((u) => pathname === u.href || pathname.startsWith(u.href + "/"));

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink bg-white px-4 sm:px-6 lg:h-16 lg:px-8">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buka menu"
        className="grid size-9 shrink-0 place-items-center border border-ink text-ink transition-colors hover:bg-black hover:text-white lg:hidden"
      >
        <Menu className="size-4" />
      </button>
      <Link href={home} className="shrink-0 lg:hidden" aria-label="Beranda">
        <Logo compact />
      </Link>

      <nav aria-label="Posisi halaman" className="min-w-0 flex-1">
        <ol className="flex items-center gap-2 truncate text-[13px]">
          {crumbs.map((c, i) => (
            <li key={`${c}-${i}`} className="flex min-w-0 items-center gap-2">
              {i > 0 && <span className="text-ink-muted">/</span>}
              <span className={i === crumbs.length - 1 ? "truncate font-semibold text-ink" : "truncate text-ink-muted"}>{c}</span>
            </li>
          ))}
        </ol>
      </nav>

      {unit && (
        <span className="hidden shrink-0 border border-ink px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] sm:inline-block">
          {UNIT_TYPE_LABEL[unit.type]}
        </span>
      )}

      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-[80] lg:hidden">
            <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-[min(300px,86vw)] flex-col border-r border-black bg-night text-white animate-slide-down">
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-night-line px-4">
                <Logo invert />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Tutup menu"
                  className="grid size-9 place-items-center border border-night-line text-white transition-colors hover:bg-white hover:text-black"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <NavContent nav={nav} user={user} onNavigate={() => setOpen(false)} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </header>
  );
}
