"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { useI18n } from "@/lib/i18n/client";
import { deleteActualLineAction } from "../actions";

/**
 * Trash button of one keterangan biaya in RAB Actual. It removes the line's real costs (with their receipts and the assets
 * they made). A line added on this page goes with them; a RAB Budget line goes too only when "also from RAB Budget" stays ticked.
 */
export function DeleteLineButton({
  lineKey,
  name,
  fromBudget,
  costCount,
  total,
  className,
  withLabel,
}: {
  lineKey: string;
  name: string;
  /** The line comes from RAB Budget (not added on the RAB Actual page). */
  fromBudget: boolean;
  costCount: number;
  total: number;
  className?: string;
  /** Show "Hapus keterangan" next to the icon (the detail dialog); the grid shows the icon only. */
  withLabel?: boolean;
}) {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState(false);
  const [withBudgetLine, setWithBudgetLine] = useState(true);
  const [pending, start] = useTransition();
  const nothing = fromBudget && !withBudgetLine && costCount === 0;
  const title = t("Hapus keterangan biaya");

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setWithBudgetLine(true);
          setOpen(true);
        }}
        title={title}
        aria-label={`${title}: ${name}`}
        className={className ?? "grid size-8 place-items-center text-ink-muted transition-colors hover:bg-ink hover:text-white disabled:opacity-50"}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        {withLabel && <span>{t("Hapus keterangan")}</span>}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" title={t("Hapus “{name}”?", { name })} description={t("Tindakan ini tidak dapat dibatalkan.")}>
          <div className="space-y-4 text-sm">
            <p className="text-ink-secondary">
              {costCount > 0
                ? t("{n} biaya actual (total {amount}) pada keterangan ini akan dihapus permanen, beserta bukti struk dan aset yang dibuat dari biaya itu.", {
                    n: fmt.number(costCount),
                    amount: fmt.rupiah(total),
                  })
                : t("Keterangan ini belum punya biaya actual.")}
            </p>
            {fromBudget ? (
              <label className="flex cursor-pointer items-start gap-2.5 border border-ink px-3 py-2.5">
                <input type="checkbox" checked={withBudgetLine} onChange={(e) => setWithBudgetLine(e.target.checked)} className="mt-0.5 size-4 accent-black" />
                <span>
                  <span className="block font-semibold text-ink">{t("Hapus juga dari RAB Budget")}</span>
                  <span className="block text-[11px] text-ink-muted">
                    {withBudgetLine
                      ? t("Baris dan budgetnya hilang dari RAB Budget dan RAB Actual.")
                      : t("Hanya biaya actual yang dihapus; baris dan budgetnya tetap ada di RAB Budget.")}
                  </span>
                </span>
              </label>
            ) : (
              <p className="text-[11px] text-ink-muted">{t("Keterangan biaya ini ditambahkan di RAB Actual (di luar RAB Budget) dan ikut terhapus.")}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t("Batal")}
              </Button>
              <Button
                variant="primary"
                disabled={nothing}
                onClick={() => {
                  setOpen(false);
                  start(async () => {
                    const result = await deleteActualLineAction(lineKey, withBudgetLine);
                    if (result?.error) toast(result.error, { tone: "error" });
                    else toast.success(!fromBudget || withBudgetLine ? t("Keterangan biaya dihapus") : t("Biaya actual dihapus"));
                  });
                }}
              >
                {t("Hapus")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
