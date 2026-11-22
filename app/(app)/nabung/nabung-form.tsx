"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { MoneyInput } from "@/components/finance/money-input";
import { APP_TIME_ZONE } from "@/lib/i18n/format";
import type { FormState } from "@/lib/form";
import { cn } from "@/lib/utils";
import { deleteSavingAction, saveSavingAction } from "./actions";

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: APP_TIME_ZONE });

/** The Pencatatan input: nama, nominal, tanggal, keterangan (masuk / keluar). Stays on the page and clears itself after a save. */
export function SavingForm({ names, balances }: { names: string[]; balances: Record<string, number> }) {
  const formRef = useRef<HTMLFormElement>(null);
  // a new key remounts the fields (blank again) after a successful save
  const [round, setRound] = useState(0);
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [savedOn, setSavedOn] = useState(today);
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveSavingAction(prev, formData);
    if (!result) {
      toast.success(formData.get("direction") === "out" ? "Uang keluar dicatat" : "Uang masuk dicatat");
      setName("");
      setRound((r) => r + 1);
    }
    return result;
  }, undefined);
  const fe = state?.fieldErrors ?? {};
  const val = (k: string) => state?.values?.[k];
  const balance = balances[name.trim().replace(/\s+/g, " ").toLowerCase()];

  return (
    <form ref={formRef} action={action} className="space-y-4" noValidate>
      <div key={round} className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Nama"
          error={fe.name}
          hint={balance !== undefined ? `Jumlah uang sekarang Rp ${balance.toLocaleString("id-ID")}` : "Ketik nama baru atau pilih dari daftar."}
          className="sm:col-span-2"
        >
          <Input name="name" list="saving-names" required maxLength={120} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!fe.name || undefined} />
        </Field>
        <Field label="Nominal" error={fe.amount}>
          <MoneyInput name="amount" required defaultValue={val("amount")} invalid={!!fe.amount} />
        </Field>
        <Field label="Tanggal" error={fe.savedOn}>
          <Input type="date" name="savedOn" required value={savedOn} onChange={(e) => setSavedOn(e.target.value)} />
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-ink">Keterangan</legend>
          <div className="grid grid-cols-2 border border-ink">
            {(
              [
                ["in", "Masuk", "Uang ditabung"],
                ["out", "Keluar", "Uang diambil"],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer flex-col px-3 py-2 text-sm transition-colors first:border-r first:border-ink",
                  direction === value ? "bg-black text-white" : "bg-white text-ink hover:bg-surface-2",
                )}
              >
                {/* no `name`: React resets the form after each submit, which would put the radio back on "Masuk"
                    while the screen still shows the choice — the hidden field below carries the real value */}
                <input type="radio" value={value} checked={direction === value} onChange={() => setDirection(value)} className="sr-only" />
                <span className="font-semibold">{label}</span>
                <span className={cn("text-[11px]", direction === value ? "text-white/70" : "text-ink-muted")}>{hint}</span>
              </label>
            ))}
          </div>
          <input type="hidden" name="direction" value={direction} />
          {fe.direction && <p className="mt-1 text-[11px] font-semibold text-ink">⚠ {fe.direction}</p>}
        </fieldset>
      </div>

      <datalist id="saving-names">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {state?.error && (
        <p role="alert" className="border border-ink bg-surface-2 px-3 py-2 text-xs font-semibold text-ink">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />}
        {pending ? "Menyimpan…" : direction === "out" ? "Catat uang keluar" : "Catat uang masuk"}
      </Button>
    </form>
  );
}

/** Trash button of one Pencatatan row, with a confirmation. */
export function DeleteSavingButton({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen(true)}
        title="Hapus"
        aria-label={`Hapus ${label}`}
        className="grid size-8 place-items-center text-ink-muted transition-colors hover:bg-ink hover:text-white disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Hapus catatan ini?"
        description={`“${label}” akan dihapus permanen dan jumlah uangnya dihitung ulang. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus"
        onConfirm={() =>
          start(async () => {
            const result = await deleteSavingAction(id);
            if (result?.error) toast(result.error, { tone: "error" });
            else toast.success("Catatan dihapus");
          })
        }
      />
    </>
  );
}
