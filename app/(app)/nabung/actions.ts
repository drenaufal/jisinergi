"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/auth/rbac";
import { actionUser } from "@/lib/auth/session";
import { formError, type FormState } from "@/lib/form";
import { getT } from "@/lib/i18n/server";
import { FinanceRuleError } from "@/lib/finance/records";
import { addSaving, deleteSaving, savingSchema } from "@/lib/finance/savings";

/* Nabung is the Owner's own book: every action re-checks that the caller is the Owner. */

export async function saveSavingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getT();
  const user = await actionUser("all-units");
  const parsed = savingSchema(t).safeParse({ ...Object.fromEntries(formData), amount: String(formData.get("amount") ?? "").replace(/\D/g, "") });
  if (!parsed.success) return formError(t, parsed.error, formData);
  try {
    await addSaving(t, user, parsed.data);
  } catch (error) {
    if (error instanceof FinanceRuleError) return formError(t, error.fieldErrors, formData, error.message);
    throw error;
  }
  revalidatePath("/", "layout");
  return undefined;
}

export async function deleteSavingAction(id: string): Promise<{ error?: string } | undefined> {
  const t = await getT();
  const user = await actionUser("all-units");
  if (!can(user.role, "delete")) return { error: t("Akses ditolak untuk tindakan ini.") };
  try {
    await deleteSaving(t, user, id);
  } catch (error) {
    if (error instanceof FinanceRuleError) return { error: error.message };
    throw error;
  }
  revalidatePath("/", "layout");
  return undefined;
}
