"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/auth/rbac";
import { actionUser } from "@/lib/auth/session";
import { formError, type FormState } from "@/lib/form";
import { getT } from "@/lib/i18n/server";
import { FinanceRuleError } from "@/lib/finance/records";
import { createGlobalOwner, deleteGlobalOwner, renameGlobalOwner } from "@/lib/finance/global-owners";

export async function addOwnerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getT();
  const user = await actionUser("all-units");
  const name = String(formData.get("name") ?? "");
  try {
    await createGlobalOwner(t, user, name);
  } catch (error) {
    if (error instanceof FinanceRuleError) return formError(t, error.fieldErrors, formData, error.message);
    throw error;
  }
  revalidatePath("/", "layout");
  return undefined;
}

export async function renameOwnerAction(id: string, newName: string): Promise<{ error?: string } | undefined> {
  const t = await getT();
  const user = await actionUser("all-units");
  try {
    await renameGlobalOwner(t, user, id, newName);
  } catch (error) {
    if (error instanceof FinanceRuleError) {
      const fieldMsg = Object.values(error.fieldErrors)[0];
      return { error: fieldMsg || error.message };
    }
    throw error;
  }
  revalidatePath("/", "layout");
  return undefined;
}

export async function deleteOwnerAction(id: string): Promise<{ error?: string } | undefined> {
  const t = await getT();
  const user = await actionUser("all-units");
  if (!can(user.role, "delete")) return { error: t("Akses ditolak untuk tindakan ini.") };
  try {
    await deleteGlobalOwner(t, user, id);
  } catch (error) {
    if (error instanceof FinanceRuleError) return { error: error.message };
    throw error;
  }
  revalidatePath("/", "layout");
  return undefined;
}
