import { APP_TIME_ZONE } from "@/lib/i18n/format";

/** Today's month in WIB as "YYYY-MM" (the server may run in UTC). */
export const currentMonth = () => new Date().toLocaleDateString("sv-SE", { timeZone: APP_TIME_ZONE }).slice(0, 7);

/** "2026-03" → a Date at the start of that month, for the date formatter. */
export const monthStart = (month: string) => `${month}-01`;
