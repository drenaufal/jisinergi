import { INTL_LOCALE, type Locale } from "./config";

/**
 * Every date is shown in WIB regardless of where the code runs. Without this a
 * server in UTC (Hostinger) would render kick-off times 7 hours early, and the
 * browser could disagree with the server on hydration.
 */
export const APP_TIME_ZONE = "Asia/Jakarta";

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000000],
  ["month", 2592000000],
  ["day", 86400000],
  ["hour", 3600000],
  ["minute", 60000],
  ["second", 1000],
];

/** Largest first: [size, suffix]. Indonesian says ribu / juta / miliar / triliun. */
const COMPACT_ID: [number, string][] = [
  [1e12, "T"],
  [1e9, "M"],
  [1e6, "jt"],
  [1e3, "rb"],
];
const COMPACT_EN: [number, string][] = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

export type Formatters = ReturnType<typeof makeFormatters>;

/** Date, number and currency formatting bound to one language. */
export function makeFormatters(locale: Locale) {
  const tag = INTL_LOCALE[locale];

  const number = (n: number, opts?: Intl.NumberFormatOptions) => new Intl.NumberFormat(tag, opts).format(n);

  return {
    locale,
    tag,
    date(date: Date | string | number, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
      return new Intl.DateTimeFormat(tag, { timeZone: APP_TIME_ZONE, ...opts }).format(new Date(date));
    },
    dateTime(date: Date | string | number) {
      return new Intl.DateTimeFormat(tag, {
        timeZone: APP_TIME_ZONE,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(date));
    },
    time(date: Date | string | number) {
      return new Intl.DateTimeFormat(tag, {
        timeZone: APP_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(date));
    },
    number,
    /** Always "Rp", also in English — `Intl` would print "IDR" there. */
    rupiah(n: number) {
      return `Rp ${number(n, { maximumFractionDigits: 0 })}`;
    },
    /**
     * "Rp 265,2 jt" / "Rp 265.2M": short enough for a stat tile; the full figure goes in a tooltip.
     * Written out instead of using `Intl`'s compact notation, because Node and browsers disagree on the
     * English suffixes ("10M" vs "10m") and a server-rendered chart would then fail to hydrate.
     */
    rupiahCompact(n: number) {
      const sign = n < 0 ? "-" : "";
      const abs = Math.abs(n);
      const steps = locale === "id" ? COMPACT_ID : COMPACT_EN;
      for (let i = 0; i < steps.length; i++) {
        const [size, suffix] = steps[i];
        if (abs < size) continue;
        let value = Math.round((abs / size) * 100) / 100;
        let unit = suffix;
        // 999.999 rb must read "1 jt", not "1.000 rb"
        if (value >= 1000 && i > 0) {
          const [bigger, biggerSuffix] = steps[i - 1];
          value = Math.round((abs / bigger) * 100) / 100;
          unit = biggerSuffix;
        }
        return `Rp\u00a0${sign}${number(value, { maximumFractionDigits: 2 })}${locale === "id" ? "\u00a0" : ""}${unit}`;
      }
      return `Rp\u00a0${sign}${number(abs, { maximumFractionDigits: 0 })}`;
    },
    relative(date: Date | string | number) {
      const diff = new Date(date).getTime() - Date.now();
      const abs = Math.abs(diff);
      const rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
      for (const [unit, ms] of RELATIVE_UNITS) {
        if (abs >= ms || unit === "second") return rtf.format(Math.round(diff / ms), unit);
      }
      return "";
    },
  };
}
