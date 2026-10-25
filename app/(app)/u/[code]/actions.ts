"use server";

import { revalidatePath } from "next/cache";
import { actionUser } from "@/lib/auth/session";
import { formError, type FormState } from "@/lib/form";
import { getT } from "@/lib/i18n/server";
import { ENTITIES, isFinanceKind, type FinanceKind } from "@/lib/finance/entities";
import { scopeOf } from "@/lib/finance/access";
import { FinanceRuleError, deleteFinanceRecord, markCapitalReturned, saveFinanceRecord } from "@/lib/finance/records";

/* Every action re-checks who is asking: the page that rendered the button is not trusted. */

/** Pages are rendered on demand, so a change only has to drop the client-side cache. */
function refresh() {
  revalidatePath("/", "layout");
}

/** Create (id = null) or update one row of any kind. */
export async function saveRecord(kind: FinanceKind, id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getT();
  if (!isFinanceKind(kind)) return { error: t("Jenis data tidak dikenal.") };
  const user = await actionUser("input");
  const scope = scopeOf(user);

  const parsed = ENTITIES[kind].schema(t).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return formError(t, parsed.error, formData);

  const unitField = formData.get("businessUnitId");
  try {
    await saveFinanceRecord({
      t,
      actor: user,
      scope,
      kind,
      id,
      requestedUnitId: typeof unitField === "string" && unitField ? unitField : null,
      values: parsed.data,
    });
  } catch (error) {
    if (error instanceof FinanceRuleError) return formError(t, error.fieldErrors, formData, error.message);
    throw error;
  }
  refresh();
  return undefined;
}

export type DeleteResult = { error?: string } | undefined;

export async function deleteRecord(kind: FinanceKind, id: string): Promise<DeleteResult> {
  const t = await getT();
  if (!isFinanceKind(kind)) return { error: t("Jenis data tidak dikenal.") };
  const user = await actionUser("delete");
  const scope = scopeOf(user);
  try {
    await deleteFinanceRecord({ t, actor: user, scope, kind, id });
  } catch (error) {
    if (error instanceof FinanceRuleError) return { error: error.message };
    throw error;
  }
  refresh();
  return undefined;
}

export async function markReturned(id: string): Promise<DeleteResult> {
  const t = await getT();
  const user = await actionUser("input");
  const scope = scopeOf(user);
  try {
    await markCapitalReturned({ t, actor: user, scope, id });
  } catch (error) {
    if (error instanceof FinanceRuleError) return { error: error.message };
    throw error;
  }
  refresh();
  return undefined;
}
