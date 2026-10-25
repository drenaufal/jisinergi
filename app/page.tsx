import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { listVisibleUnits } from "@/lib/finance/access";
import { homeFor } from "@/lib/nav";

export const dynamic = "force-dynamic";

/** Sends everybody to their own start page: the owner to the overview, a unit admin to their unit. */
export default async function Home({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const units = await listVisibleUnits(user);
  const home = homeFor({ role: user.role, unitCode: units[0]?.code });
  const { denied } = await searchParams;
  redirect(denied ? `${home}?denied=1` : home);
}
