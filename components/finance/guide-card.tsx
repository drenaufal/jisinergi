"use client";

import * as React from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export type GuideTerm = { term: string; text: string };

const CHANGE_EVENT = "keuangan-guide-change";

function subscribeToStorage(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(CHANGE_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(CHANGE_EVENT, notify);
  };
}

function readStored(key: string) {
  try {
    return window.localStorage.getItem(key) === "closed" ? "closed" : "open";
  } catch {
    return "open";
  }
}

/**
 * "Cara membaca halaman ini": a plain-language explanation of what the table is, what each column
 * means and where the totals come from, so someone seeing the numbers for the first time is not left
 * guessing. Open by default; once a person closes it, it stays closed on their device.
 */
export function GuideCard({
  id,
  title,
  intro,
  terms,
  tip,
}: {
  /** Per-page key for remembering the open/closed state. */
  id: string;
  title: string;
  intro: string;
  terms: GuideTerm[];
  tip?: string;
}) {
  const t = useT();
  const key = `keuangan-guide:${id}`;
  // What this device remembered ("open" on the server and when storage is blocked), plus this visit's own toggle.
  const remembered = React.useSyncExternalStore(subscribeToStorage, () => readStored(key), () => "open");
  const [picked, setPicked] = React.useState<boolean | null>(null);
  const open = picked ?? remembered !== "closed";

  const toggle = () => {
    setPicked(!open);
    try {
      window.localStorage.setItem(key, open ? "closed" : "open");
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      /* storage blocked: the toggle still works for this visit */
    }
  };

  return (
    <section className="mb-5 border border-line bg-surface-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="grid size-8 shrink-0 place-items-center bg-black text-white">
          <BookOpen className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{title}</span>
          {!open && <span className="block truncate text-xs text-ink-muted">{intro}</span>}
        </span>
        <span className="hidden text-[11px] font-medium text-ink-muted sm:block">{open ? t("Sembunyikan") : t("Tampilkan")}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-ink-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-line px-4 pb-4 pt-3">
          <p className="max-w-3xl text-[13px] leading-relaxed text-ink-secondary">{intro}</p>
          <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {terms.map((item) => (
              <div key={item.term} className="text-xs leading-relaxed">
                <dt className="font-semibold text-ink">{item.term}</dt>
                <dd className="text-ink-secondary">{item.text}</dd>
              </div>
            ))}
          </dl>
          {tip && (
            <p className="border border-line bg-surface px-3 py-2 text-xs text-ink-secondary">
              <span className="font-semibold text-ink">{t("Tips")}: </span>
              {tip}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
