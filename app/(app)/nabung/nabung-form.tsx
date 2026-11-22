"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Loader2, Save, Search, Trash2 } from "lucide-react";
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
const savingKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** Dropdown menu to pick an owner exclusively from Data Owner, styled in brutalist monochrome. */
function OwnerDropdown({
  names,
  balances,
  value,
  onChange,
  error,
}: {
  names: string[];
  balances: Record<string, number>;
  value: string;
  onChange: (val: string) => void;
  error?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && names.length > 5) {
      searchInputRef.current?.focus();
    }
  }, [isOpen, names.length]);

  const filteredNames = query.trim()
    ? names.filter((n) => n.toLowerCase().includes(query.trim().toLowerCase()))
    : names;

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name="name" value={value} />

      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
          setQuery("");
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          "flex h-10 w-full items-center justify-between border bg-surface px-3 text-left text-sm transition-colors cursor-pointer select-none",
          error
            ? "border-ink font-medium"
            : isOpen
              ? "border-ink outline-2 outline-black"
              : "border-line hover:border-ink",
          !value && "text-ink-muted",
        )}
      >
        <span className={cn("truncate font-medium", value ? "text-ink" : "text-ink-muted")}>
          {value || "Pilih nama owner…"}
        </span>
        <ChevronDown
          className={cn(
            "ml-2 size-4 shrink-0 text-ink transition-transform duration-150",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 max-h-64 w-full overflow-hidden border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
        >
          {names.length > 5 && (
            <div className="border-b-2 border-black bg-surface-2 p-2">
              <div className="relative flex items-center">
                <Search className="pointer-events-none absolute left-2.5 size-3.5 text-ink-muted" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Cari owner…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full border border-black bg-white py-1 pl-8 pr-2 text-xs text-ink placeholder:text-ink-muted outline-none focus:bg-white"
                />
              </div>
            </div>
          )}

          <div className="max-h-52 overflow-y-auto">
            {filteredNames.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-ink-muted">
                {names.length === 0
                  ? "Belum ada owner di Data Owner."
                  : `Owner "${query}" tidak ditemukan.`}
              </div>
            ) : (
              filteredNames.map((n) => {
                const isSelected = value.toLowerCase() === n.toLowerCase();
                const bal = balances[savingKey(n)];

                return (
                  <button
                    key={n}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(n);
                      setIsOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "group flex w-full items-center justify-between border-b border-line px-3 py-2.5 text-left text-sm transition-colors last:border-b-0 cursor-pointer",
                      isSelected
                        ? "bg-black text-white"
                        : "bg-white text-ink hover:bg-black hover:text-white",
                    )}
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      {isSelected ? (
                        <Check className="size-4 shrink-0 stroke-[2.5]" />
                      ) : (
                        <span className="size-4 shrink-0" />
                      )}
                      <span className="truncate font-semibold">{n}</span>
                    </div>

                    <div className="shrink-0 text-right">
                      {bal !== undefined ? (
                        <span
                          className={cn(
                            "font-mono text-xs tabular-nums",
                            isSelected
                              ? "text-white/80"
                              : "text-ink-muted group-hover:text-white/80",
                          )}
                        >
                          Rp {bal.toLocaleString("id-ID")}
                        </span>
                      ) : (
                        <span
                          className={cn(
                            "text-[10px] uppercase tracking-wider",
                            isSelected
                              ? "text-white/60"
                              : "text-ink-muted/70 group-hover:text-white/60",
                          )}
                        >
                          Rp 0
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
  const balance = balances[savingKey(name)];

  return (
    <form ref={formRef} action={action} className="space-y-4" noValidate>
      <div key={round} className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Nama Owner"
          error={fe.name}
          hint={
            name
              ? balance !== undefined
                ? `Jumlah uang sekarang Rp ${balance.toLocaleString("id-ID")}`
                : "Belum ada saldo tabungan (Rp 0)."
              : "Pilih owner terdaftar dari Data Owner."
          }
          className="sm:col-span-2"
        >
          <OwnerDropdown
            names={names}
            balances={balances}
            value={name}
            onChange={setName}
            error={fe.name}
          />
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
