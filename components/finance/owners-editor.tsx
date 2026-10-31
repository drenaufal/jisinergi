"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/finance/money-input";
import { BP_TOTAL, bpToField, equalShares, percentToBp } from "@/lib/finance/ownership";
import { useT } from "@/lib/i18n/client";

export type OwnerRow = { name: string; percent: string; capital?: number | string };

type Row = OwnerRow & { key: number };

// row keys only have to be unique and stable while the editor is open
let lastKey = 0;
const make = (row: OwnerRow): Row => ({ ...row, key: ++lastKey });

/**
 * The owners of a unit and what share of its dividend each one gets. It posts repeated `ownerName` /
 * `ownerPercent` (/ `ownerCapital`) fields, which lib/finance/ownership.ts reads and validates on the server.
 * While nobody has typed a percentage, adding or removing an owner re-splits 100 % equally.
 */
export function OwnersEditor({
  initial,
  withCapital,
  error,
}: {
  initial?: OwnerRow[];
  /** Also ask how much modal each owner puts in (a new Sekolah Bola). */
  withCapital?: boolean;
  error?: string;
}) {
  const t = useT();
  const [rows, setRows] = React.useState<Row[]>(() => {
    if (initial?.length) return initial.map(make);
    const shares = equalShares(2);
    return shares.map((bp) => make({ name: "", percent: bpToField(bp), capital: "" }));
  });
  // true once someone typed a percentage by hand (or the owners were saved before): then nothing is re-split automatically
  const [manual, setManual] = React.useState(!!initial?.length);

  const split = (list: Row[]) => {
    const shares = equalShares(list.length);
    return list.map((r, i) => ({ ...r, percent: bpToField(shares[i]) }));
  };
  const add = () => setRows((list) => (manual ? [...list, make({ name: "", percent: "", capital: "" })] : split([...list, make({ name: "", percent: "", capital: "" })])));
  const remove = (key: number) => setRows((list) => (manual ? list.filter((r) => r.key !== key) : split(list.filter((r) => r.key !== key))));
  const patch = (key: number, change: Partial<OwnerRow>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...change } : r)));

  const total = rows.reduce((sum, r) => sum + (percentToBp(r.percent) ?? 0), 0);
  const balanced = total === BP_TOTAL;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.key} className="grid items-start gap-2 border border-line p-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto]" data-owner-row>
            <Field label={`${t("Pemilik")} ${i + 1}`}>
              <Input name="ownerName" required maxLength={120} value={r.name} onChange={(e) => patch(r.key, { name: e.target.value })} placeholder={t("Nama pemilik")} />
            </Field>
            <Field label={t("Persentase")}>
              <div className="relative">
                <Input
                  name="ownerPercent"
                  required
                  inputMode="decimal"
                  autoComplete="off"
                  value={r.percent}
                  onChange={(e) => {
                    setManual(true);
                    patch(r.key, { percent: e.target.value });
                  }}
                  className="pr-8 tabular-nums"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">%</span>
              </div>
            </Field>
            <div className="flex items-end justify-end sm:pt-6">
              <button
                type="button"
                onClick={() => remove(r.key)}
                disabled={rows.length <= 1}
                title={t("Hapus pemilik")}
                aria-label={t("Hapus pemilik")}
                className="grid size-10 place-items-center border border-line text-ink-muted transition-colors hover:bg-ink hover:text-white disabled:pointer-events-none disabled:opacity-40"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            {withCapital && (
              <Field label={t("Modal disetor")} hint={t("Opsional. Dicatat di menu Modal.")} className="sm:col-span-3">
                <MoneyInput name="ownerCapital" defaultValue={r.capital} />
              </Field>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={rows.length >= 20}>
          <Plus className="size-3.5" /> {t("Tambah pemilik")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setManual(false);
            setRows((list) => split(list));
          }}
        >
          {t("Bagi rata")}
        </Button>
        <p className={balanced ? "ml-auto text-xs font-semibold tabular-nums text-ink" : "ml-auto border border-ink bg-surface-2 px-2 py-1 text-xs font-semibold tabular-nums text-ink"} aria-live="polite">
          {balanced ? t("Total 100% ✓") : t("Total {total}% — harus tepat 100%", { total: bpToField(total) })}
        </p>
      </div>
      {error && <p role="alert" className="text-[11px] font-semibold text-ink">⚠ {error}</p>}
    </div>
  );
}
