import * as React from "react";
import { cn } from "@/lib/utils";

/* ── Progress ──────────────────────────────────────────────────────── */
export function Progress({
  value,
  className,
}: {
  value: number;
  className?: string;
  /** Kept for older callers; the bar is always black. */
  tone?: "brand" | "info" | "warn" | "danger" | "success";
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("h-2.5 w-full border border-ink bg-white", className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full bg-black transition-all" style={{ width: `${clamped}%` }} />
    </div>
  );
}

/* ── Skeleton ──────────────────────────────────────────────────────── */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-elevated", className)} />;
}

/* ── Separator ─────────────────────────────────────────────────────── */
export function Separator({ className, orientation = "horizontal" }: { className?: string; orientation?: "horizontal" | "vertical" }) {
  return <div className={cn("bg-line", orientation === "horizontal" ? "h-px w-full" : "h-full w-px", className)} />;
}

/* ── Empty state ───────────────────────────────────────────────────── */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center border border-dashed border-ink/40 px-6 py-12 text-center", className)}>
      {Icon && (
        <div className="mb-3 flex size-11 items-center justify-center border border-ink text-ink">
          <Icon className="size-5" />
        </div>
      )}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
