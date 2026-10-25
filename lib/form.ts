import { z } from "zod";
import type { TFunction } from "@/lib/i18n/translate";

/* Shared helpers for registry form server actions. */

export type FormState =
  | {
      error?: string;
      fieldErrors?: Record<string, string>;
      /** Submitted values, echoed back so fields keep their input after a failed submit. */
      values?: Record<string, string>;
    }
  | undefined;

/** Optional integer form field: blank → undefined (instead of coercing "" to 0). */
export function optionalInt(min: number, max: number, message: string) {
  return z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number(message).int(message).min(min, message).max(max, message).optional(),
  );
}

export function requiredInt(min: number, max: number, message: string) {
  return z.coerce.number(message).int(message).min(min, message).max(max, message);
}

function echo(formData: FormData) {
  const values: Record<string, string> = {};
  formData.forEach((v, k) => {
    if (typeof v === "string" && !k.startsWith("$ACTION")) values[k] = v;
  });
  return values;
}

/** Builds the failed-submit state from a Zod error or explicit field errors. */
export function formError(
  t: TFunction,
  err: z.ZodError | Record<string, string>,
  formData: FormData,
  message: string = t("Periksa kembali isian formulir."),
): FormState {
  const fieldErrors =
    err instanceof z.ZodError
      ? Object.fromEntries(err.issues.map((i) => [String(i.path[0]), i.message]))
      : err;
  return { error: message, fieldErrors, values: echo(formData) };
}
