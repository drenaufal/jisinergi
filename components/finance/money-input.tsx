"use client";

import * as React from "react";
import { useI18n } from "@/lib/i18n/client";
import { inputBase } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Rupiah field. The person sees "1.750.000" while typing; the form submits plain digits under
 * `name`. Anything that is not a digit is dropped, so a pasted "Rp 1.750.000,-" still works.
 */
export function MoneyInput({
  name,
  defaultValue,
  required,
  placeholder = "0",
  invalid,
  id,
  onValueChange,
}: {
  name: string;
  defaultValue?: number | string | null;
  required?: boolean;
  placeholder?: string;
  invalid?: boolean;
  id?: string;
  /** Called with the amount (0 when empty) on every keystroke, e.g. to preview a total. */
  onValueChange?: (amount: number) => void;
}) {
  const { fmt } = useI18n();
  const initial = String(defaultValue ?? "").replace(/\D/g, "");
  const [digits, setDigits] = React.useState(initial);
  const shown = digits === "" ? "" : fmt.number(Number(digits));
  const change = (raw: string) => {
    const next = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 13);
    setDigits(next);
    onValueChange?.(next === "" ? 0 : Number(next));
  };

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-muted">Rp</span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        required={required}
        placeholder={placeholder}
        value={shown}
        onChange={(e) => change(e.target.value)}
        className={cn(inputBase, "pl-10 tabular-nums", invalid && "border-ink")}
        aria-invalid={invalid || undefined}
      />
      <input type="hidden" name={name} value={digits} />
    </div>
  );
}
