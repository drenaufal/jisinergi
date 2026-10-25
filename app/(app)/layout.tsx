import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { listVisibleUnits } from "@/lib/finance/access";
import { buildNav, homeFor } from "@/lib/nav";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { AccessNotice } from "@/components/shell/access-notice";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const units = await listVisibleUnits(user);
  const nav = buildNav(user, units);
  const home = homeFor({ role: user.role, unitCode: units[0]?.code });
  const shellUser = { name: user.name, email: user.email, role: user.role, title: user.title };

  return (
    <div className="min-h-dvh bg-white lg:flex">
      <Sidebar nav={nav} user={shellUser} home={home} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar nav={nav} user={shellUser} home={home} />
        <main className="mx-auto w-full max-w-[1320px] min-w-0 flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8">{children}</main>
      </div>
      <Suspense fallback={null}>
        <AccessNotice />
      </Suspense>
    </div>
  );
}
