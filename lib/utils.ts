import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* Dates, numbers and relative times are formatted by `fmt` (lib/i18n/format.ts). */
export { APP_TIME_ZONE } from "@/lib/i18n/format";
