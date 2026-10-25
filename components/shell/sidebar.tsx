import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import type { NavModel } from "@/lib/nav";
import { NavContent, type ShellUser } from "./nav-content";

/** Desktop sidebar: solid black, full height. Hidden below lg (the mobile header opens the same navigation as a drawer). */
export function Sidebar({ nav, user, home }: { nav: NavModel; user: ShellUser; home: string }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[264px] shrink-0 flex-col border-r border-black bg-night text-white lg:flex">
      <Link href={home} aria-label="Beranda" className="flex h-16 shrink-0 items-center border-b border-night-line px-5">
        <Logo invert />
      </Link>
      <div className="min-h-0 flex-1">
        <NavContent nav={nav} user={user} />
      </div>
    </aside>
  );
}
