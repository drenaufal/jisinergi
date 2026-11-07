"use client";

import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { FoldChevron, FoldingToolbar, useFolding } from "@/components/finance/collapse";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { DeleteRecordButton } from "../forms";

export type BudgetLineView = { id: string; name: string; isAsset: boolean; note: string | null; quantity: number; unitPrice: number; total: number };
export type BudgetGroupView = { category: string; subtotal: number; items: BudgetLineView[] };
export type BudgetFooterRow = { label: string; value: number; strong?: boolean };

/**
 * One part of the RAB Budget (weekly or monthly costs): categories that fold open and shut, each with its cost lines.
 * A wide table on a tablet or desktop, a stacked list on a phone — the lines carry the same data in both.
 */
export function BudgetTable({ part, groups, footer, canDelete }: { part: string; groups: BudgetGroupView[]; footer: BudgetFooterRow[]; canDelete: boolean }) {
  const { t, fmt } = useI18n();
  const keys = groups.map((g) => g.category);
  const fold = useFolding(keys);

  return (
    <div className="space-y-3">
      <FoldingToolbar total={keys.length} openCount={fold.openCount} onOpenAll={fold.openAll} onCloseAll={fold.closeAll} />

      {/* ── tablet and desktop ─────────────────────────────────────── */}
      <div className="hidden w-full overflow-x-auto border border-line sm:block">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead className="bg-surface-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="w-14 px-3 py-2.5 text-left">{t("No")}</th>
              <th className="px-3 py-2.5 text-left">
                {t("Keterangan biaya")}
                <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal">{t("Apa yang dibayar")}</span>
              </th>
              <th className="w-28 px-3 py-2.5 text-right">
                {t("Jumlah Satuan")}
                <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal">{t("Berapa banyak")}</span>
              </th>
              <th className="w-32 px-3 py-2.5 text-right">
                {t("Harga satuan")}
                <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal">{t("Per 1 satuan")}</span>
              </th>
              <th className="w-36 px-3 py-2.5 text-right">
                {t("Total")}
                <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal">{t("Jumlah satuan × harga")}</span>
              </th>
              {canDelete && <th className="w-14 px-2"><span className="sr-only">{t("Aksi")}</span></th>}
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => {
              const open = fold.isOpen(g.category);
              return (
                <Fragment key={g.category}>
                  <tr className="border-t border-line bg-surface-2/70">
                    <td className="px-3 py-2 text-xs font-bold tabular-nums text-ink-secondary">{gi + 1}</td>
                    <td colSpan={3} className="p-0">
                      <button
                        type="button"
                        onClick={() => fold.toggle(g.category)}
                        aria-expanded={open}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-ink hover:bg-surface-2"
                      >
                        <FoldChevron open={open} />
                        {g.category}
                        <span className="text-[11px] font-normal text-ink-muted">· {t("{n} baris", { n: g.items.length })}</span>
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right text-[13px] font-bold tabular-nums text-ink">{fmt.rupiah(g.subtotal)}</td>
                    {canDelete && <td />}
                  </tr>
                  {open &&
                    g.items.map((item, ii) => (
                      <tr key={item.id} className="border-t border-line-soft transition-colors hover:bg-surface-2/50">
                        <td className="px-3 py-2 text-xs tabular-nums text-ink-muted">{gi + 1}.{ii + 1}</td>
                        <td className="px-3 py-2 text-ink-secondary">
                          {item.name}
                          {item.isAsset && <Badge className="ml-2 align-middle" tone="info">{t("Aset")}</Badge>}
                          {item.total === 0 && <Badge className="ml-2 align-middle" tone="neutral">{t("Belum dianggarkan")}</Badge>}
                          {item.note && <span className="block text-[11px] text-ink-muted">{item.note}</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">{fmt.number(item.quantity)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">{fmt.rupiah(item.unitPrice)}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-ink">{item.total === 0 ? "—" : fmt.rupiah(item.total)}</td>
                        {canDelete && (
                          <td className="px-2 py-1">
                            <div className="flex justify-end gap-0.5">
                              <DeleteRecordButton kind="budget" id={item.id} name={item.name} />
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            {footer.map((f, i) => (
              <tr key={i} className={cn("border-t", f.strong ? "border-t-2 border-line bg-surface-2" : "border-line-soft")}>
                <td colSpan={4} className={cn("px-3 py-2.5 text-right text-xs uppercase tracking-wider", f.strong ? "font-bold text-ink" : "font-semibold text-ink-secondary")}>
                  {f.label}
                </td>
                <td className={cn("px-3 py-2.5 text-right tabular-nums", f.strong ? "text-sm font-bold text-ink" : "font-semibold text-ink-secondary")}>{fmt.rupiah(f.value)}</td>
                {canDelete && <td />}
              </tr>
            ))}
          </tfoot>
        </table>
      </div>

      {/* ── phone ──────────────────────────────────────────────────── */}
      <div className="border border-line sm:hidden" aria-label={part}>
        {groups.map((g, gi) => {
          const open = fold.isOpen(g.category);
          return (
            <section key={g.category} className={cn(gi > 0 && "border-t border-line")}>
              <button
                type="button"
                onClick={() => fold.toggle(g.category)}
                aria-expanded={open}
                className="flex w-full items-start gap-2 bg-surface-2/70 px-3 py-2.5 text-left"
              >
                <FoldChevron open={open} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold leading-snug text-ink">
                    <span className="mr-1.5 tabular-nums text-ink-muted">{gi + 1}.</span>
                    {g.category}
                  </span>
                  <span className="text-[11px] text-ink-muted">{t("{n} baris", { n: g.items.length })}</span>
                </span>
                <span className="shrink-0 text-[13px] font-bold tabular-nums text-ink">{fmt.rupiahCompact(g.subtotal)}</span>
              </button>
              {open && (
                <ul className="divide-y divide-line-soft">
                  {g.items.map((item, ii) => (
                    <li key={item.id} className="flex items-start gap-2 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug text-ink">
                          <span className="mr-1.5 text-[11px] tabular-nums text-ink-muted">{gi + 1}.{ii + 1}</span>
                          {item.name}
                          {item.isAsset && <Badge className="ml-2 align-middle" tone="info">{t("Aset")}</Badge>}
                        </p>
                        <p className="mt-0.5 text-[11px] tabular-nums text-ink-muted">
                          {fmt.number(item.quantity)} {t("satuan")} × {fmt.rupiah(item.unitPrice)}
                        </p>
                        {item.total === 0 && <Badge className="mt-1" tone="neutral">{t("Belum dianggarkan")}</Badge>}
                        {item.note && <p className="mt-0.5 text-[11px] text-ink-muted">{item.note}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="text-sm font-semibold tabular-nums text-ink">{item.total === 0 ? "—" : fmt.rupiah(item.total)}</span>
                        {canDelete && <DeleteRecordButton kind="budget" id={item.id} name={item.name} />}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        <dl className="divide-y divide-line border-t-2 border-line bg-surface-2">
          {footer.map((f, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 px-3 py-2.5">
              <dt className={cn("text-[11px] uppercase tracking-wider", f.strong ? "font-bold text-ink" : "font-semibold text-ink-secondary")}>{f.label}</dt>
              <dd className={cn("tabular-nums", f.strong ? "text-sm font-bold text-ink" : "text-sm font-semibold text-ink-secondary")}>{fmt.rupiah(f.value)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
