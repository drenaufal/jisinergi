import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type FormulaLine = {
  label: string;
  /** Formatted amount, e.g. "Rp 60.000.000". */
  value: string;
  /** "+" / "−" sign shown before the label. Leave out for the first line. */
  op?: "+" | "−";
  /** Where the number comes from (links to that menu). */
  href?: string;
  hint?: string;
};

/**
 * A worked formula as a receipt: operand lines, a rule, then the result in a black bar. Used wherever the app
 * shows a derived figure (both dividend formulas), so the reader sees which numbers went in.
 */
export function Formula({
  title,
  formula,
  lines,
  resultLabel,
  result,
  note,
  className,
}: {
  title: string;
  /** The rule in words, e.g. "RAB − (Uang modal + Registrasi + Match fee)". */
  formula: string;
  lines: FormulaLine[];
  resultLabel: string;
  result: string;
  note?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border border-ink bg-white", className)}>
      <header className="border-b border-ink px-5 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink">{title}</h2>
        <p className="mt-1 font-mono text-[12px] text-ink-secondary">{formula}</p>
      </header>
      <ul className="divide-y divide-line">
        {lines.map((l) => (
          <li key={l.label} className="flex items-baseline gap-3 px-5 py-2.5 text-sm">
            <span className="w-4 shrink-0 font-mono text-ink-muted">{l.op ?? ""}</span>
            <span className="min-w-0 flex-1">
              {l.href ? (
                <Link href={l.href} className="font-medium text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink">
                  {l.label}
                </Link>
              ) : (
                <span className="font-medium text-ink">{l.label}</span>
              )}
              {l.hint && <span className="block text-[11px] text-ink-muted">{l.hint}</span>}
            </span>
            <span className="shrink-0 font-mono tabular-nums text-ink">{l.value}</span>
          </li>
        ))}
      </ul>
      <footer className="flex items-baseline justify-between gap-3 bg-black px-5 py-3 text-white">
        <span className="text-xs font-semibold uppercase tracking-[0.1em]">= {resultLabel}</span>
        <span className="font-mono text-lg font-semibold tabular-nums">{result}</span>
      </footer>
      {note && <div className="border-t border-line px-5 py-3 text-xs leading-relaxed text-ink-secondary">{note}</div>}
    </section>
  );
}
