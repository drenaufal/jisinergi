"use client";

import * as React from "react";
import { ChevronDown, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Which categories of a list are folded. Everything starts open; the toolbar and the category headers fold and unfold.
 * Shared by the RAB Budget and RAB Actual tables, so a long list can be read one category at a time.
 */
export function useFolding(keys: readonly string[]) {
  const [closed, setClosed] = React.useState<ReadonlySet<string>>(() => new Set());
  const isOpen = (key: string) => !closed.has(key);
  const toggle = (key: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const openAll = () => setClosed(new Set());
  const closeAll = () => setClosed(new Set(keys));
  const openCount = keys.filter((k) => !closed.has(k)).length;
  return { isOpen, toggle, openAll, closeAll, openCount };
}

/** "Buka semua" / "Ciutkan semua" for a folding list. */
export function FoldingToolbar({ total, openCount, onOpenAll, onCloseAll, className }: { total: number; openCount: number; onOpenAll: () => void; onCloseAll: () => void; className?: string }) {
  const t = useT();
  if (total < 2) return null;
  const button = "inline-flex h-8 items-center gap-1.5 border px-2.5 text-xs font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40";
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <button type="button" onClick={onOpenAll} disabled={openCount === total} className={cn(button, "border-ink text-ink hover:bg-ink hover:text-white")}>
        <ChevronsUpDown className="size-3.5" /> {t("Buka semua")}
      </button>
      <button type="button" onClick={onCloseAll} disabled={openCount === 0} className={cn(button, "border-ink text-ink hover:bg-ink hover:text-white")}>
        <ChevronsDownUp className="size-3.5" /> {t("Ciutkan semua")}
      </button>
      <span className="text-[11px] text-ink-muted">{t("{open} dari {total} kategori terbuka", { open: openCount, total })}</span>
    </div>
  );
}

/** The chevron of a category header. */
export function FoldChevron({ open, className }: { open: boolean; className?: string }) {
  return <ChevronDown aria-hidden className={cn("size-4 shrink-0 transition-transform", !open && "-rotate-90", className)} />;
}
