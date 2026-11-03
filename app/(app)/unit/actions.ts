"use server";

import { revalidatePath } from "next/cache";
import { actionUser } from "@/lib/auth/session";
import { auditText, recordAudit } from "@/lib/audit";
import { formError, type FormState } from "@/lib/form";
import { getT } from "@/lib/i18n/server";
import { UserEmailExists } from "@/lib/finance/units";
import { bpToField, readOwnerRows } from "@/lib/finance/ownership";
import {
  UnitRuleError,
  createUnit,
  createUnitLogin,
  makeEditLoginSchema,
  makeEditUnitSchema,
  makeNewLoginSchema,
  makeNewUnitSchema,
  updateUnit,
  updateUnitLogin,
} from "@/lib/finance/units";

function refresh() {
  revalidatePath("/", "layout");
}

/** The password is never echoed back into the form after a failed submit. */
function publicFields(data: FormData) {
  const safe = new FormData();
  data.forEach((value, key) => {
    if (typeof value === "string" && !/password/i.test(key) && !key.startsWith("$ACTION")) safe.set(key, value);
  });
  return safe;
}

/** Turns the errors the unit logic raises into form state. `prefix` maps field names (loginEmail → email). */
function toFormState(
  t: Awaited<ReturnType<typeof getT>>,
  error: unknown,
  formData: FormData,
  rename: Record<string, string> = {},
): FormState {
  const fields = publicFields(formData);
  if (error instanceof UserEmailExists) return formError(t, { [rename.email ?? "email"]: error.message }, fields);
  if (error instanceof UnitRuleError) {
    const mapped = Object.fromEntries(Object.entries(error.fieldErrors).map(([k, v]) => [rename[k] ?? k, v]));
    return formError(t, mapped, fields, error.message);
  }
  throw error;
}

const flag = (formData: FormData, key: string) => formData.get(key) === "on";

/** New unit, optionally with its first login in the same step. */
export async function createUnitAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getT();
  const actor = await actionUser("units:manage");
  const raw = Object.fromEntries(formData);

  const unit = makeNewUnitSchema(t).safeParse({ ...raw, owners: readOwnerRows(formData) });
  const wantsLogin = typeof raw.loginEmail === "string" && raw.loginEmail.trim() !== "";
  const login = wantsLogin
    ? makeNewLoginSchema(t).safeParse({ name: raw.loginName, email: raw.loginEmail, password: raw.loginPassword })
    : null;

  const errors: Record<string, string> = {};
  if (!unit.success) for (const i of unit.error.issues) errors[String(i.path[0])] = i.message;
  if (login && !login.success) {
    const rename: Record<string, string> = { name: "loginName", email: "loginEmail", password: "loginPassword" };
    for (const i of login.error.issues) errors[rename[String(i.path[0])] ?? String(i.path[0])] = i.message;
  }
  if (Object.keys(errors).length || !unit.success) return formError(t, errors, publicFields(formData));

  try {
    const created = await createUnit(t, unit.data, actor.id);
    await recordAudit({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: "finance.unit.create",
      entityType: "business_unit",
      entityId: created.id,
      summary: auditText("Unit bisnis dibuat: {name} ({code})", { name: created.name, code: created.code }),
    });
    await recordAudit({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: "finance.unit.owners",
      entityType: "business_unit",
      entityId: created.id,
      summary: auditText("Kepemilikan {unit} diatur: {shares}", {
        unit: created.name,
        shares: created.owners.map((o) => `${o.name} ${bpToField(o.shareBp)}%`).join(" · "),
      }),
    });
    if (login?.success) {
      const account = await createUnitLogin(t, created.id, login.data);
      await recordAudit({
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: "finance.unit.login",
        entityType: "user",
        entityId: account.id,
        summary: auditText("Akun login unit dibuat: {email} ({unit})", { email: account.email, unit: account.unit }),
      });
    }
  } catch (error) {
    return toFormState(t, error, formData, { email: "loginEmail" });
  }
  refresh();
  return undefined;
}

export async function updateUnitAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getT();
  const actor = await actionUser("units:manage");
  const parsed = makeEditUnitSchema(t).safeParse({ ...Object.fromEntries(formData), active: flag(formData, "active") });
  if (!parsed.success) return formError(t, parsed.error, publicFields(formData));
  try {
    const { after } = await updateUnit(t, id, parsed.data);
    await recordAudit({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: "finance.unit.update",
      entityType: "business_unit",
      entityId: id,
      summary: auditText("Unit bisnis diperbarui: {name}", { name: after.name }),
    });
  } catch (error) {
    return toFormState(t, error, formData);
  }
  refresh();
  return undefined;
}

export async function createLoginAction(unitId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getT();
  const actor = await actionUser("units:manage");
  const parsed = makeNewLoginSchema(t).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return formError(t, parsed.error, publicFields(formData));
  try {
    const account = await createUnitLogin(t, unitId, parsed.data);
    await recordAudit({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: "finance.unit.login",
      entityType: "user",
      entityId: account.id,
      summary: auditText("Akun login unit dibuat: {email} ({unit})", { email: account.email, unit: account.unit }),
    });
  } catch (error) {
    return toFormState(t, error, formData);
  }
  refresh();
  return undefined;
}

export async function updateLoginAction(userId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getT();
  const actor = await actionUser("units:manage");
  const parsed = makeEditLoginSchema(t).safeParse({ ...Object.fromEntries(formData), active: flag(formData, "active") });
  if (!parsed.success) return formError(t, parsed.error, publicFields(formData));
  try {
    const { after } = await updateUnitLogin(t, userId, parsed.data);
    await recordAudit({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: "finance.unit.login",
      entityType: "user",
      entityId: userId,
      summary: auditText("Akun login unit diperbarui: {email}", { email: after.email }),
    });
  } catch (error) {
    return toFormState(t, error, formData);
  }
  refresh();
  return undefined;
}
