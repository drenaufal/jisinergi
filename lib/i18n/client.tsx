"use client";

import * as React from "react";
import type { Locale } from "./config";
import { makeFormatters, type Formatters } from "./format";
import { createT, type TFunction } from "./translate";

type I18n = { locale: Locale; t: TFunction; fmt: Formatters };

const I18nContext = React.createContext<I18n | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = React.useMemo<I18n>(() => ({ locale, t: createT(locale), fmt: makeFormatters(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = React.useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside <LocaleProvider>.");
  return value;
}

/** `t(...)` for a Client Component. */
export function useT() {
  return useI18n().t;
}
