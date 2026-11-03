"use client";

import { useState } from "react";
import { Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ProofChip } from "@/components/finance/bits";
import { useI18n } from "@/lib/i18n/client";
import { AddRecordButton, DeleteRecordButton, EditRecordButton, type FinanceRecord, type FormContext } from "../forms";

export type DetailCost = {
  id: string;
  businessUnitId: string;
  /** "b:<id>" / "a:<id>": the cost line the cost belongs to (what the edit form preselects). */
  itemRef: string;
  amount: number;
  spentOn: string;
  /** Program week the date falls in (0 = before week 1, null = the program has no start yet). */
  week: number | null;
  proofUrl: string | null;
  note: string | null;
};

export type DetailLine = {
  key: string;
  /** The id of an extra line (null for a RAB line): extra lines can be renamed or removed here. */
  extraId: string | null;
  /** The note of an extra line (RAB lines are final and have none to edit here). */
  note: string | null;
  name: string;
  category: string;
  /** Weekly or monthly: the part of the page the line sits in. */
  period: "weekly" | "monthly";
  businessUnitId: string;
  /** "Per minggu", "Sekali" or null (extra line, no budget). */
  periodLabel: string | null;
  isAsset: boolean;
  budget: number;
  programBudget: number;
  total: number;
  remaining: number;
};

/**
 * The cost line's name in the RAB Actual grid. Clicking it opens what was recorded for that line: every cost
 * with its date, week, amount, receipt and note, plus the buttons to add, correct or remove them.
 */
export function CostDetail({
  line,
  costs,
  ctx,
  canInput,
  canDelete,
}: {
  line: DetailLine;
  costs: DetailCost[];
  ctx: FormContext;
  canInput: boolean;
  canDelete: boolean;
}) {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState(false);
  const weekLabel = (w: number | null) => (w === null ? "—" : w >= 1 ? t("Week {n}", { n: w }) : t("Sebelum"));
  const record = (c: DetailCost): FinanceRecord => ({
    id: c.id,
    businessUnitId: c.businessUnitId,
    itemRef: c.itemRef,
    amount: c.amount,
    spentOn: c.spentOn,
    proofUrl: c.proofUrl,
    note: c.note,
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("Lihat rincian biaya")}
        className="text-left font-medium text-ink underline decoration-ink/30 underline-offset-2 transition-colors hover:decoration-ink"
      >
        {line.name}
      </button>
      {line.isAsset && <Badge className="ml-2 align-middle" tone="info">{t("Aset")}</Badge>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" title={line.name} description={`${line.category}${line.periodLabel ? ` · ${line.periodLabel}` : ""}`}>
          <div className="space-y-4">
            <dl className="grid grid-cols-3 gap-px border border-ink bg-ink text-center">
              <div className="bg-white p-3">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{t("Budget program")}</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-ink">{line.programBudget > 0 ? fmt.rupiah(line.programBudget) : "—"}</dd>
              </div>
              <div className="bg-black p-3 text-white">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-white/70">{t("Actual")}</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums">{fmt.rupiah(line.total)}</dd>
              </div>
              <div className="bg-surface-2 p-3">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{line.remaining < 0 ? t("Lebih dari budget") : t("Sisa budget")}</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-ink">{line.programBudget > 0 || line.total > 0 ? fmt.rupiah(Math.abs(line.remaining)) : "—"}</dd>
              </div>
            </dl>

            {costs.length === 0 ? (
              <p className="border border-dashed border-ink/40 px-4 py-6 text-center text-xs text-ink-muted">{t("Belum ada biaya actual untuk keterangan ini.")}</p>
            ) : (
              <div className="overflow-x-auto border border-line">
                <table className="w-full min-w-[32rem] border-collapse text-sm">
                  <thead className="bg-surface-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">{t("Tanggal bayar")}</th>
                      <th className="px-3 py-2 text-left">{t("Minggu")}</th>
                      <th className="px-3 py-2 text-right">{t("Actual biaya")}</th>
                      <th className="px-3 py-2 text-left">{t("Bukti")}</th>
                      {(canInput || canDelete) && <th className="w-20 px-2"><span className="sr-only">{t("Aksi")}</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {costs.map((c) => (
                      <tr key={c.id} className="border-t border-line-soft align-top">
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                          {fmt.date(c.spentOn)}
                          {c.note && <span className="block max-w-[14rem] whitespace-normal text-[11px] text-ink-muted">{c.note}</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-ink-secondary">{weekLabel(c.week)}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-ink">{fmt.rupiah(c.amount)}</td>
                        <td className="px-3 py-2"><ProofChip url={c.proofUrl} viewLabel={t("Lihat bukti")} missingLabel={t("Belum ada bukti")} /></td>
                        {(canInput || canDelete) && (
                          <td className="px-2 py-1">
                            <div className="flex justify-end gap-0.5">
                              {canInput && <EditRecordButton kind="actualcost" record={record(c)} ctx={ctx} />}
                              {canDelete && <DeleteRecordButton kind="actualcost" id={c.id} name={`${fmt.date(c.spentOn)} · ${fmt.rupiah(c.amount)}`} />}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-ink bg-surface-2">
                      <td colSpan={2} className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink">{t("Total actual")}</td>
                      <td className="px-3 py-2 text-right text-sm font-bold tabular-nums text-ink">{fmt.rupiah(line.total)}</td>
                      <td colSpan={canInput || canDelete ? 2 : 1} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {(canInput || (canDelete && line.extraId && costs.length === 0)) && (
              <div className="flex flex-wrap items-center gap-2">
                {canInput && (
                  <AddRecordButton kind="actualcost" ctx={ctx} preset={{ itemRef: line.key }}>
                    {t("Tambah biaya actual")}
                  </AddRecordButton>
                )}
                {canInput && line.extraId && (
                  <EditRecordButton
                    kind="actualitem"
                    record={{ id: line.extraId, businessUnitId: line.businessUnitId, category: line.category, name: line.name, period: line.period, note: line.note }}
                    ctx={ctx}
                    label={t("Ubah keterangan biaya")}
                    className="inline-flex h-8 items-center gap-1.5 border border-ink px-3 text-xs font-semibold text-ink transition-colors hover:bg-ink hover:text-white"
                  >
                    {t("Ubah keterangan")}
                  </EditRecordButton>
                )}
                {canDelete && line.extraId && costs.length === 0 && (
                  <span className="ml-auto flex items-center gap-1 text-[11px] text-ink-muted">
                    <Receipt className="size-3" /> {t("Hapus keterangan ini")}
                    <DeleteRecordButton kind="actualitem" id={line.extraId} name={line.name} />
                  </span>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
