import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "./index";
import { can, isRole, type Capability, type Role } from "./rbac";
import { db } from "@/lib/db";
import { businessUnitMembers, businessUnits, users } from "@/lib/db/schema";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string | null;
  /** The unit a unit admin belongs to (null for the owner, or for a login not linked to a unit yet). */
  unitId: string | null;
};

/** The signed-in account, read from the database on every request so a deactivated login stops working at once. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  if (!session?.user?.email) return null;
  const account = await db.query.users.findFirst({
    where: eq(users.email, session.user.email),
    columns: { id: true, name: true, email: true, role: true, title: true, active: true },
  });
  if (!account?.active || !isRole(account.role)) return null;
  let unitId: string | null = null;
  if (account.role === "unit_admin") {
    const [member] = await db
      .select({ unitId: businessUnitMembers.businessUnitId })
      .from(businessUnitMembers)
      .innerJoin(businessUnits, eq(businessUnits.id, businessUnitMembers.businessUnitId))
      .where(eq(businessUnitMembers.userId, account.id))
      .limit(1);
    unitId = member?.unitId ?? null;
  }
  return { id: account.id, name: account.name, email: account.email, role: account.role, title: account.title, unitId };
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Page guard: the signed-in user must hold the capability, otherwise they are sent back to their home with a notice. */
export async function requireCapability(capability: Capability) {
  const user = await requireUser();
  if (!can(user.role, capability)) redirect("/?denied=1");
  return user;
}

/** For server actions: throws instead of redirecting. */
export async function actionUser(capability?: Capability) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sesi tidak ditemukan. Silakan masuk kembali.");
  if (capability && !can(user.role, capability)) throw new Error("Akses ditolak untuk tindakan ini.");
  return user;
}
