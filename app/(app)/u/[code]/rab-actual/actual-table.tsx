"use client";

import { Fragment } from "react";
import { Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FoldChevron, FoldingToolbar, useFolding } from "@/components/finance/collapse";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { AddRecordButton, type FormContext } from "../forms";
import { CostDetail, type DetailCost, type DetailLine } from "./cost-detail";

type Money = Record<number, number>;

export type ActualLineView = {
  key: string;
  name: string;
  /** A cost line that is not in the RAB Budget. */
  extra: boolean;
  isAsset: boolean;
  budget: number;
  programBudget: number;
  byWeek: Money;
  total: number;
  remaining: number;
  /** "Per minggu" / "Sekali", shown under the budget of a weekly line. */
  periodLabel: string;
  detail: DetailLine;
  costs: DetailCost[];
};
export type ActualGroupView = {
  category: string;
  budget: number;
  programBudget: number;
  byWeek: Money;
  total: number;
  remaining: number;
  lines: ActualLineView[];
};
export type ActualTotalsView = { budget: number; programBudget: number; byWeek: Money; total: number; remaining: number };
export type ActualVarianceView = { weeks: number; budgetPerWeek: number; budget: number; difference: number; perWeek: Money };
export type WeekColumn = { week: number; head: string; date: string | null };

/** "a.", "b.", … then "27.", "28." once the alphabet runs out. */
const letter = (i: number) => (i < 26 ? `${String.fromCharCode(97 + i)}.` : `${i + 1}.`);

/**
 * One part of the RAB Actual (weekly or monthly costs). Wide screens get the sheet-like grid (budget, one column per week,
 * total, rest); a phone gets one card per cost line with the weeks that have costs listed under it. The categories fold in both.
 */
export function ActualTable({
  weekly,
  groups,
  totals,
  variance,
  weeks,
  ctx,
  canInput,
  canDelete,
  note,
}: {
  weekly: boolean;
  groups: ActualGroupView[];
  totals: ActualTotalsView;
  /** Weekly part only: how the weeks that have run did against the weekly budget. */
  variance: ActualVarianceView | null;
  weeks: WeekColumn[];
  ctx: FormContext;
  canInput: boolean;
  canDelete: boolean;
  note: string;
}) {
  const { t, fmt } = useI18n();
  const fold = useFolding(groups.map((g) => g.category));
  const cols = weeks.length + (weekly ? 5 : 4) + (canInput ? 1 : 0);
  const sectionOver = totals.remaining < 0;
  const diffLabel = (n: number) => (n === 0 ? "0" : `${n > 0 ? "▲" : "▼"} ${fmt.number(Math.abs(n))}`);
  const rest = (n: number, show: boolean) => (show ? `${n < 0 ? "▲ " : ""}${fmt.number(Math.abs(n))}` : "—");
  const costWeeks = (byWeek: Money) =>
    weeks.filter((w) => byWeek[w.week]).map((w) => ({ ...w, amount: byWeek[w.week] }));
  const addCost = (key: string, className: string) => (
    <AddRecordButton kind="actualcost" ctx={ctx} variant="cell" preset={{ itemRef: key }} label={t("Tambah biaya actual")} className={className}>
      <Receipt className="size-3.5" />
    </AddRecordButton>
  );

  return (
    <div className="space-y-3">
      <FoldingToolbar total={groups.length} openCount={fold.openCount} onOpenAll={fold.openAll} onCloseAll={fold.closeAll} />

      {/* ── tablet and desktop: the sheet ───────────────────────────── */}
      <div className="hidden w-full overflow-x-auto border border-ink md:block">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead className="bg-surface-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink">
            <tr className="border-b border-ink">
              <th className="sticky left-0 z-20 w-12 bg-surface-2 px-3 py-2.5 text-left">{t("No")}</th>
              <th className="sticky left-12 z-20 min-w-56 bg-surface-2 px-3 py-2.5 text-left">{t("Keterangan biaya")}</th>
              <th className="px-3 py-2.5 text-right">{t("Budget")}</th>
              {weekly && <th className="px-3 py-2.5 text-right">{t("Budget program")}</th>}
              {weeks.map((w) => (
                <th key={w.week} className="min-w-24 px-3 py-2.5 text-right">
                  {w.head}
                  {w.date && <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-ink-muted">{w.date}</span>}
                </th>
              ))}
              <th className="px-3 py-2.5 text-right">{t("Total")}</th>
              <th className="px-3 py-2.5 text-right">{t("Sisa")}</th>
              {canInput && <th className="w-12 px-2"><span className="sr-only">{t("Aksi")}</span></th>}
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => {
              const open = fold.isOpen(g.category);
              return (
                <Fragment key={g.category}>
                  <tr className="bg-black text-white">
                    <td className="sticky left-0 z-10 bg-black px-3 py-2 text-xs font-bold tabular-nums">{gi + 1}</td>
                    <td className="sticky left-12 z-10 min-w-56 bg-black p-0">
                      <button type="button" onClick={() => fold.toggle(g.category)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold hover:bg-white/10">
                        <FoldChevron open={open} />
                        {g.category}
                        <span className="text-[11px] font-normal text-white/60">· {g.lines.length}</span>
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right text-[13px] font-semibold tabular-nums">{g.budget > 0 ? fmt.number(g.budget) : "—"}</td>
                    {weekly && <td className="px-3 py-2 text-right text-[13px] tabular-nums text-white/80">{g.programBudget > 0 ? fmt.number(g.programBudget) : "—"}</td>}
                    {weeks.map((w) => (
                      <td key={w.week} className="px-3 py-2 text-right text-[13px] tabular-nums text-white/90">{g.byWeek[w.week] ? fmt.number(g.byWeek[w.week]) : ""}</td>
                    ))}
                    <td className="px-3 py-2 text-right text-[13px] font-bold tabular-nums">{fmt.number(g.total)}</td>
                    <td className="px-3 py-2 text-right text-[13px] font-semibold tabular-nums">{g.programBudget > 0 || g.total > 0 ? fmt.number(g.remaining) : "—"}</td>
                    {canInput && <td />}
                  </tr>
                  {open &&
                    g.lines.map((l, li) => {
                      const hasBudget = l.programBudget > 0;
                      return (
                        <tr key={l.key} className="border-t border-line-soft hover:bg-surface-2/60">
                          <td className="sticky left-0 z-10 bg-white px-3 py-2 text-xs tabular-nums text-ink-muted">{letter(li)}</td>
                          <td className="sticky left-12 z-10 min-w-56 bg-white px-3 py-2">
                            <CostDetail line={l.detail} costs={l.costs} ctx={ctx} canInput={canInput} canDelete={canDelete} />
                            {l.extra && <span className="ml-2 align-middle text-[10px] uppercase tracking-wider text-ink-muted">{t("Di luar RAB Budget")}</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">
                            {hasBudget ? fmt.number(l.budget) : "—"}
                            {weekly && hasBudget && <span className="block text-[10px] text-ink-muted">{l.periodLabel}</span>}
                          </td>
                          {weekly && <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{hasBudget ? fmt.number(l.programBudget) : "—"}</td>}
                          {weeks.map((w) => (
                            <td key={w.week} className={cn("px-3 py-2 text-right tabular-nums", l.byWeek[w.week] ? "bg-elevated font-medium text-ink" : "text-ink-muted")}>
                              {l.byWeek[w.week] ? fmt.number(l.byWeek[w.week]) : ""}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">{l.total > 0 ? fmt.number(l.total) : "—"}</td>
                          <td className={cn("px-3 py-2 text-right tabular-nums", l.remaining < 0 ? "font-bold text-ink" : "text-ink-secondary")}>{rest(l.remaining, hasBudget || l.total > 0)}</td>
                          {canInput && <td className="px-1 py-1">{addCost(l.key, "grid size-8 place-items-center text-ink-muted transition-colors hover:bg-ink hover:text-white")}</td>}
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink bg-surface-2 text-sm font-bold tabular-nums text-ink">
              <td className="sticky left-0 z-10 bg-surface-2" />
              <td className="sticky left-12 z-10 bg-surface-2 px-3 py-3 text-xs uppercase tracking-wider">{weekly ? t("Total mingguan") : t("Total bulanan")}</td>
              <td className="px-3 py-3 text-right">{totals.budget > 0 ? fmt.number(totals.budget) : "—"}</td>
              {weekly && <td className="px-3 py-3 text-right">{totals.programBudget > 0 ? fmt.number(totals.programBudget) : "—"}</td>}
              {weeks.map((w) => (
                <td key={w.week} className="px-3 py-3 text-right">{totals.byWeek[w.week] ? fmt.number(totals.byWeek[w.week]) : ""}</td>
              ))}
              <td className="px-3 py-3 text-right">{fmt.number(totals.total)}</td>
              <td className="px-3 py-3 text-right">{`${sectionOver ? "▲ " : ""}${fmt.number(Math.abs(totals.remaining))}`}</td>
              {canInput && <td />}
            </tr>
            {variance && variance.weeks > 0 && (
              <>
                <tr className="border-t border-line text-xs tabular-nums text-ink-secondary">
                  <td className="sticky left-0 z-10 bg-white" />
                  <td className="sticky left-12 z-10 bg-white px-3 py-2 uppercase tracking-wider">{t("Budget per minggu")}</td>
                  <td />
                  <td />
                  {weeks.map((w) => (
                    <td key={w.week} className="px-3 py-2 text-right">{w.week >= 1 && w.week <= variance.weeks ? fmt.number(variance.budgetPerWeek) : ""}</td>
                  ))}
                  <td className="px-3 py-2 text-right">{fmt.number(variance.budget)}</td>
                  <td />
                  {canInput && <td />}
                </tr>
                <tr className="border-t border-line text-xs font-semibold tabular-nums text-ink">
                  <td className="sticky left-0 z-10 bg-white" />
                  <td className="sticky left-12 z-10 bg-white px-3 py-2 uppercase tracking-wider">{t("Selisih (actual − budget)")}</td>
                  <td />
                  <td />
                  {weeks.map((w) => (
                    <td key={w.week} className="px-3 py-2 text-right">{w.week >= 1 && w.week <= variance.weeks ? diffLabel(variance.perWeek[w.week]) : ""}</td>
                  ))}
                  <td className="px-3 py-2 text-right">{diffLabel(variance.difference)}</td>
                  <td />
                  {canInput && <td />}
                </tr>
              </>
            )}
            <tr>
              <td colSpan={cols} className="px-3 py-2 text-[11px] text-ink-muted">{note}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── phone: one card per cost line ───────────────────────────── */}
      <div className="border border-ink md:hidden">
        {groups.map((g, gi) => {
          const open = fold.isOpen(g.category);
          return (
            <section key={g.category} className={cn(gi > 0 && "border-t border-ink")}>
              <button type="button" onClick={() => fold.toggle(g.category)} aria-expanded={open} className="flex w-full items-start gap-2 bg-black px-3 py-2.5 text-left text-white">
                <FoldChevron open={open} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold leading-snug">
                    <span className="mr-1.5 tabular-nums text-white/60">{gi + 1}.</span>
                    {g.category}
                  </span>
                  <span className="text-[11px] text-white/70">
                    {t("{n} baris", { n: g.lines.length })}
                    {g.programBudget > 0 && ` · ${t("Budget")} ${fmt.rupiahCompact(g.programBudget)}`}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[13px] font-bold tabular-nums">{fmt.rupiahCompact(g.total)}</span>
                  <span className="text-[10px] uppercase tracking-wider text-white/60">{t("Actual")}</span>
                </span>
              </button>
              {open && (
                <ul className="divide-y divide-line-soft bg-white">
                  {g.lines.map((l, li) => {
                    const hasBudget = l.programBudget > 0;
                    const spent = costWeeks(l.byWeek);
                    return (
                      <li key={l.key} className="space-y-2 px-3 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 text-sm leading-snug">
                            <span className="mr-1.5 text-[11px] tabular-nums text-ink-muted">{letter(li)}</span>
                            <CostDetail line={l.detail} costs={l.costs} ctx={ctx} canInput={canInput} canDelete={canDelete} />
                            {l.extra && <Badge className="ml-2 align-middle" tone="neutral">{t("Di luar RAB Budget")}</Badge>}
                          </div>
                          {canInput && addCost(l.key, "grid size-8 shrink-0 place-items-center border border-line text-ink-muted transition-colors hover:bg-ink hover:text-white")}
                        </div>
                        <dl className="grid grid-cols-3 gap-px border border-line bg-line text-center">
                          <div className="bg-white px-1 py-1.5">
                            <dt className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-muted">{weekly ? t("Budget program") : t("Budget")}</dt>
                            <dd className="mt-0.5 text-xs font-medium tabular-nums text-ink-secondary">{hasBudget ? fmt.rupiahCompact(l.programBudget) : "—"}</dd>
                          </div>
                          <div className="bg-surface-2 px-1 py-1.5">
                            <dt className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-muted">{t("Actual")}</dt>
                            <dd className="mt-0.5 text-xs font-bold tabular-nums text-ink">{l.total > 0 ? fmt.rupiahCompact(l.total) : "—"}</dd>
                          </div>
                          <div className="bg-white px-1 py-1.5">
                            <dt className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-muted">{t("Sisa")}</dt>
                            <dd className={cn("mt-0.5 text-xs tabular-nums", l.remaining < 0 ? "font-bold text-ink" : "text-ink-secondary")}>
                              {hasBudget || l.total > 0 ? `${l.remaining < 0 ? "▲ " : ""}${fmt.rupiahCompact(Math.abs(l.remaining))}` : "—"}
                            </dd>
                          </div>
                        </dl>
                        {weekly && hasBudget && <p className="text-[11px] text-ink-muted">{t("Budget {amount} {period}", { amount: fmt.rupiah(l.budget), period: l.periodLabel.toLowerCase() })}</p>}
                        {spent.length > 0 && (
                          <ul className="flex flex-wrap gap-1.5" aria-label={t("Biaya actual per minggu")}>
                            {spent.map((w) => (
                              <li key={w.week} className="border border-line bg-elevated px-2 py-1 text-[11px] tabular-nums text-ink">
                                <span className="font-semibold">{w.head}</span> · {fmt.number(w.amount)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}

        <div className="border-t-2 border-ink bg-surface-2 px-3 py-3 text-sm tabular-nums text-ink">
          <p className="text-xs font-bold uppercase tracking-wider">{weekly ? t("Total mingguan") : t("Total bulanan")}</p>
          <dl className="mt-1.5 grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-muted">{weekly ? t("Budget program") : t("Budget")}</dt>
              <dd className="font-semibold">{totals.programBudget > 0 ? fmt.rupiahCompact(totals.programBudget) : "—"}</dd>
            </div>
            <div>
              <dt className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-muted">{t("Actual")}</dt>
              <dd className="font-bold">{fmt.rupiahCompact(totals.total)}</dd>
            </div>
            <div>
              <dt className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-muted">{t("Sisa")}</dt>
              <dd className="font-semibold">{`${sectionOver ? "▲ " : ""}${fmt.rupiahCompact(Math.abs(totals.remaining))}`}</dd>
            </div>
          </dl>
          {variance && variance.weeks > 0 && (
            <p className="mt-2 border-t border-line pt-2 text-xs">
              <span className="font-semibold">{t("Selisih (actual − budget)")}</span>: {diffLabel(variance.difference)} · {t("{n} minggu", { n: variance.weeks })}
            </p>
          )}
          <p className="mt-2 text-[11px] font-normal text-ink-muted">{note}</p>
        </div>
      </div>
    </div>
  );
}
