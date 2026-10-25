/** The app speaks Indonesian only. `Locale` stays a type so the formatters keep their signature. */
export type Locale = "id";

export const DEFAULT_LOCALE: Locale = "id";

/** BCP 47 tag handed to `Intl` for dates and numbers. */
export const INTL_LOCALE: Record<Locale, string> = { id: "id-ID" };
