import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { listVisibleUnits } from "@/lib/finance/access";
import { homeFor } from "@/lib/nav";
import { logoutAction } from "@/app/(app)/actions";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Belum Ada Akses" };
export const dynamic = "force-dynamic";

/** Where a unit admin lands when the account has not been linked to a business unit yet. */
export default async function NoAccessPage() {
  const user = await requireUser();
  const units = await listVisibleUnits(user);
  const home = homeFor({ role: user.role, unitCode: units[0]?.code });
  if (home !== "/tanpa-akses") redirect(home);

  return (
    <div className="mx-auto max-w-lg pt-10">
      <EmptyState
        icon={LockKeyhole}
        title="Akun Anda belum terhubung ke unit bisnis"
        description="Minta Owner menghubungkan akun ini ke sebuah unit bisnis (menu Kelola Unit Bisnis). Setelah itu data unit Anda muncul di sini."
        action={
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">
              Keluar
            </Button>
          </form>
        }
      />
    </div>
  );
}
