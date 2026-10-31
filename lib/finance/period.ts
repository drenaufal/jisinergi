import { APP_TIME_ZONE } from "@/lib/i18n/format";

/** Today's month in WIB as "YYYY-MM" (the server may run in UTC). */
export const currentMonth = () => new Date().toLocaleDateString("sv-SE", { timeZone: APP_TIME_ZONE }).slice(0, 7);

/** A real calendar date written as YYYY-MM-DD ("2026-02-31" is not one). */
export const isIsoDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

/** "2026-03" → a Date at the start of that month, for the date formatter. */
export const monthStart = (month: string) => `${month}-01`;
