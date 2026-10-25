"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type UnitTab = { href: string; label: string };

/**
 * The unit's menus as a tab strip under the page title. The sidebar has the same links on desktop; this is
 * what a phone uses, and it makes "which of this unit's menus am I on" visible at a glance.
 */
export function UnitTabs({ tabs }: { tabs: UnitTab[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Menu unit" className="-mx-4 mb-6 overflow-x-auto overflow-y-hidden border-b border-line px-4 sm:mx-0 sm:px-0 lg:hidden">
      <ul className="flex min-w-max gap-0">
        {tabs.map((tab, i) => {
          const active = i === 0 ? pathname === tab.href : pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px block border-b-2 px-4 py-2.5 text-[13px] transition-colors",
                  active ? "border-black font-semibold text-ink" : "border-transparent text-ink-muted hover:border-ink/40 hover:text-ink",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
