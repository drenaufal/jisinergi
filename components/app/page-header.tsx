import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
  children,
}: {
  title: string;
  description?: string;
  /** Small label above the title (the unit name and type, for example). */
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("mb-6 border-b-2 border-ink pb-5", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{eyebrow}</div>}
          <h1 className="text-2xl font-semibold tracking-tight text-ink text-balance sm:text-[28px]">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

/*
  Stat tiles. Colour is gone: "white" is an outlined tile, the dark blocks (red / blue / night) are solid
  black with white text, "yellow" is a grey tile. Pages pick the block to say "this one matters most".
*/
const BLOCKS = {
  white: { card: "border border-line bg-surface", label: "text-ink-muted", value: "text-ink", hint: "text-ink-muted", chip: "border border-line text-ink" },
  red: { card: "border border-black bg-black", label: "text-white/80", value: "text-white", hint: "text-white/80", chip: "border border-white/40 text-white" },
  blue: { card: "border border-ink bg-surface-2", label: "text-ink-secondary", value: "text-ink", hint: "text-ink-secondary", chip: "border border-ink text-ink" },
  yellow: { card: "border border-line bg-elevated", label: "text-ink-secondary", value: "text-ink", hint: "text-ink-secondary", chip: "border border-ink/50 text-ink" },
  night: { card: "border border-black bg-black", label: "text-white/80", value: "text-white", hint: "text-white/80", chip: "border border-white/40 text-white" },
} as const;

export type StatBlock = keyof typeof BLOCKS;

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  block = "white",
  children,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "brand" | "warn" | "danger";
  block?: StatBlock;
  children?: React.ReactNode;
}) {
  const b = BLOCKS[block];
  return (
    <div className={cn("relative p-4", b.card)}>
      <div className="flex items-start justify-between gap-2">
        <span className={cn("text-[11px] font-semibold uppercase tracking-wider", b.label)}>{label}</span>
        {icon && <span className={cn("grid size-7 shrink-0 place-items-center", b.chip)}>{icon}</span>}
      </div>
      <div className={cn("mt-3 font-semibold leading-none tracking-tight tabular-nums", b.value, tone === "danger" && "underline decoration-2 underline-offset-4")}>
        {value}
      </div>
      {hint && <div className={cn("mt-2 text-xs", b.hint)}>{hint}</div>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
