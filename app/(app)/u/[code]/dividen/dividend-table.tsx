"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { saveDividendTakenAction } from "../actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { toast } from "@/components/ui/toaster";
import { MoneyInput } from "@/components/finance/money-input";
import { BP_TOTAL, bpToField, maxTaken } from "@/lib/finance/ownership";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export type DividendRow = {
  id: string;
  name: string;
  shareBp: number;
  /** The owner's part of the dividend (Rp). */
  share: number;
  /** What they already took (Rp). */
  taken: number;
};

/** Six columns on a wide screen; on a phone every owner is a card with labelled lines. */
const GRID = "sm:grid-cols-[2rem_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)]";

/**
 * "Pembagian dividen": one line per owner with the share, what was taken ("Ambil") and what is left ("Dividen final").
 * The Owner can fill in what was taken. Sekolah Bola: any amount, typed in by hand, or the "Ambil semua" checkbox.
 * Liga (`allOrNothing`): only the checkbox — an owner has taken the whole share or nothing.
 * Everyone else (and a Liga whose event is not finished) sees the figures only.
 */
export function DividendTable({
  unitId,
  rows,
  editable,
  allOrNothing,
  generated,
}: {
  unitId: string;
  rows: DividendRow[];
  /** May the signed-in person record withdrawals? (Owner, and the dividend exists.) */
  editable: boolean;
  allOrNothing: boolean;
  /** False for a Liga that is not finished yet: the shares are an estimate. */
  generated: boolean;
}) {
  const { t, fmt } = useI18n();
  const [state, run, pending] = useActionState(saveDividendTakenAction.bind(null, unitId), undefined);
  const [taken, setTaken] = useState<Record<string, number>>(() => Object.fromEntries(rows.map((r) => [r.id, r.taken])));
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state) toast.success(t("Pengambilan dividen disimpan"));
    wasPending.current = pending;
  }, [pending, state, t]);

  const fe = state?.fieldErrors ?? {};
  const takenOf = (r: DividendRow) => (editable ? (taken[r.id] ?? 0) : r.taken);
  const isAll = (r: DividendRow) => r.share > 0 && takenOf(r) >= maxTaken(r.share);
  const takers = rows.filter((r) => r.share > 0);
  const everyone = takers.length > 0 && takers.every(isAll);
  const set = (id: string, amount: number) => setTaken((m) => ({ ...m, [id]: amount }));
  const setAll = (on: boolean) => setTaken((m) => ({ ...m, ...Object.fromEntries(rows.map((r) => [r.id, on ? maxTaken(r.share) : 0])) }));
  const dirty = editable && rows.some((r) => (taken[r.id] ?? 0) !== r.taken);

  const totalBp = rows.reduce((a, r) => a + r.shareBp, 0);
  const sum = (pick: (r: DividendRow) => number) => rows.reduce((a, r) => a + pick(r), 0);
  const label = (text: string) => <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted sm:hidden">{text}</span>;

  return (
    <form action={run} className="space-y-3">
      <div className="border border-ink">
        <div className={cn("hidden items-center gap-3 border-b border-ink bg-surface-2 px-3 py-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink sm:grid", GRID)}>
          <span>{t("No")}</span>
          <span>{t("Pemilik")}</span>
          <span>{t("Persentase")}</span>
          <span className="text-right">{generated ? t("Bagian dividen") : t("Bagian (perkiraan)")}</span>
          <span className="flex items-center justify-between gap-2">
            {t("Ambil")}
            {editable && (
              <label className="flex cursor-pointer items-center gap-1.5 text-[10px] normal-case tracking-normal">
                <input type="checkbox" checked={everyone} disabled={pending || takers.length === 0} onChange={(e) => setAll(e.target.checked)} className="accent-black" />
                {t("Ambil semua")}
              </label>
            )}
          </span>
          <span className="text-right">{t("Dividen final")}</span>
        </div>

        <ul className="divide-y divide-line">
          {rows.map((r, i) => {
            const amount = takenOf(r);
            const final = r.share - amount;
            const error = fe[`taken-${r.id}`];
            return (
              <li key={r.id} className={cn("grid gap-x-3 gap-y-2 px-3 py-3 sm:items-center", GRID)}>
                <input type="hidden" name="ownerId" value={r.id} />
                <span className="hidden tabular-nums text-ink-muted sm:block">{i + 1}</span>

                <div className="flex items-center justify-between gap-2 sm:block">
                  <div className="min-w-0">
                    <span className="font-semibold text-ink sm:font-medium">{r.name}</span>
                    {generated && amount > 0 && amount >= maxTaken(r.share) && (
                      <Badge className="ml-2 align-middle" tone="success">
                        <CheckCircle2 className="size-3" /> {t("Sudah diambil")}
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-ink sm:hidden">{bpToField(r.shareBp)}%</span>
                </div>

                <div className="hidden items-center gap-2.5 sm:flex">
                  <Progress value={(r.shareBp / BP_TOTAL) * 100} className="w-20" />
                  <span className="w-14 text-right text-xs font-semibold tabular-nums text-ink">{bpToField(r.shareBp)}%</span>
                </div>

                <div className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
                  {label(generated ? t("Bagian dividen") : t("Bagian (perkiraan)"))}
                  <span className="font-medium tabular-nums text-ink">{fmt.rupiah(r.share)}</span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2 sm:block">
                    {label(t("Ambil"))}
                    {editable && !allOrNothing ? (
                      <div className="w-44 sm:w-full">
                        <MoneyInput name="taken" value={amount} disabled={pending} invalid={!!error} onValueChange={(v) => set(r.id, v)} />
                      </div>
                    ) : (
                      <>
                        {editable && <input type="hidden" name="taken" value={amount} />}
                        <span className="font-medium tabular-nums text-ink">{fmt.rupiah(amount)}</span>
                      </>
                    )}
                  </div>
                  {editable && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-secondary">
                      <input
                        type="checkbox"
                        checked={isAll(r)}
                        disabled={pending || r.share <= 0}
                        onChange={(e) => set(r.id, e.target.checked ? maxTaken(r.share) : 0)}
                        className="accent-black"
                      />
                      {allOrNothing ? t("Sudah diambil") : t("Ambil semua")}
                    </label>
                  )}
                  {error && <p className="text-[11px] font-semibold text-ink">⚠ {error}</p>}
                </div>

                <div className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
                  {label(t("Dividen final"))}
                  <span className={cn("font-semibold tabular-nums text-ink", final < 0 && "underline decoration-dotted")}>{fmt.rupiah(final)}</span>
                </div>
              </li>
            );
          })}
        </ul>

        <div className={cn("grid gap-x-3 gap-y-1 border-t-2 border-ink bg-surface-2 px-3 py-3 text-sm font-bold tabular-nums text-ink sm:items-center", GRID)}>
          <span className="hidden sm:block" />
          <span className="text-xs font-semibold uppercase tracking-wider">{t("Total")}</span>
          <span className="text-xs">{bpToField(totalBp)}%</span>
          <span className="sm:text-right">{fmt.rupiah(sum((r) => r.share))}</span>
          <span>{fmt.rupiah(sum(takenOf))}</span>
          <span className="sm:text-right">{fmt.rupiah(sum((r) => r.share - takenOf(r)))}</span>
        </div>
      </div>

      {state?.error && (
        <p role="alert" className="border border-ink bg-surface-2 px-3 py-2 text-xs font-semibold text-ink">
          {state.error}
        </p>
      )}
      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={pending || !dirty}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />}
            {pending ? t("Menyimpan…") : t("Simpan pengambilan")}
          </Button>
          <p className="text-[11px] text-ink-muted">
            {allOrNothing
              ? t("Dividen Liga hanya bisa diambil seluruhnya: centang pemilik yang uangnya sudah diambil.")
              : t("Isi jumlah yang sudah diambil tiap pemilik, atau centang “Ambil semua”. Dividen final = bagian dividen − yang diambil.")}
          </p>
        </div>
      )}
    </form>
  );
}
