import { DEFAULT_LOCALE, type Locale } from "./config";
import { makeFormatters } from "./format";
import { createT, type TFunction } from "./translate";

/** `t` (message interpolation), `fmt` (dates, numbers, Rupiah) and `locale` for the current request. */
export async function getI18n() {
  const locale: Locale = DEFAULT_LOCALE;
  return { locale, t: createT(locale), fmt: makeFormatters(locale) };
}

export async function getT() {
  return (await getI18n()).t;
}

/** Same as `getT`; kept for domain code that also runs outside a request (seeds, tests). */
export async function getSafeT(): Promise<TFunction> {
  return getT();
}
