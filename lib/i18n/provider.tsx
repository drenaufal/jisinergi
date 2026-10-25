import { I18nProvider } from "./client";

/** Mount once in the root layout: every Client Component below can call `useT()`. */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  return <I18nProvider locale="id">{children}</I18nProvider>;
}
