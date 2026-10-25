"use client";

import * as React from "react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Finance charts. They live apart from components/charts because they format Rupiah with the
 * visitor's language (so pages hand them plain numbers) and add what a finance table needs:
 * empty periods that stay visible, direct value labels, and a text summary for screen readers.
 */

/** 1, 2, 5 × 10ⁿ at or above `n` — gives the y axis round tick values. */
export function niceCeil(n: number) {
  if (n <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(n));
  const f = n / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

/** Palette for categorical series — the app's validated chart colours, in a fixed order. */
export const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-7)",
  "var(--color-chart-8)",
  "var(--color-chart-6)",
];

/* ── Column chart: one bar per period ───────────────────────────────── */

export type ColumnDatum = {
  label: string;
  value: number;
  /** Shown in the hover line, e.g. "6 laga". */
  detail?: string;
};

export function ColumnChart({
  data,
  accent = "var(--color-chart-1)",
  height = 210,
  summary,
  emptyLabel,
}: {
  data: ColumnDatum[];
  accent?: string;
  height?: number;
  /** One sentence for screen readers, e.g. "Match fee per minggu, total Rp 26 jt". */
  summary: string;
  /** Hover text for a period with nothing recorded. */
  emptyLabel: string;
}) {
  const { fmt } = useI18n();
  const [active, setActive] = React.useState<number | null>(null);
  const W = 640;
  const padL = 44;
  const padR = 8;
  const padT = 22;
  const padB = 26;
  const max = niceCeil(Math.max(...data.map((d) => d.value), 1) * 1.05);
  const ticks = 4;
  const plotW = W - padL - padR;
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.min(46, slot * 0.62);
  const y = (v: number) => padT + (1 - v / max) * (height - padT - padB);
  const compact = (v: number) => fmt.rupiahCompact(v).replace(/^Rp\s/, "");
  const shown = active !== null ? data[active] : null;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={summary}
        onMouseLeave={() => setActive(null)}
      >
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const v = (max / ticks) * i;
          return (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--color-grid)" strokeWidth={1} />
              <text x={padL - 6} y={y(v) + 3} textAnchor="end" className="fill-[var(--color-ink-muted)] text-[9px] tabular-nums">
                {compact(v)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const cx = padL + slot * i + slot / 2;
          const empty = d.value <= 0;
          const top = y(d.value);
          return (
            <g key={d.label + i} onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} tabIndex={0}>
              <rect x={padL + slot * i} y={padT} width={slot} height={height - padT - padB} fill="transparent" />
              {empty ? (
                <line
                  x1={cx - barW / 2}
                  x2={cx + barW / 2}
                  y1={y(0) - 1}
                  y2={y(0) - 1}
                  stroke="var(--color-axis)"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                />
              ) : (
                <>
                  <rect
                    x={cx - barW / 2}
                    y={top}
                    width={barW}
                    height={Math.max(2, y(0) - top)}
                    rx={4}
                    fill={accent}
                    opacity={active === null || active === i ? 1 : 0.45}
                    className="transition-opacity"
                  />
                  {data.length <= 12 && (
                    <text x={cx} y={top - 5} textAnchor="middle" className="fill-[var(--color-ink)] text-[9.5px] font-semibold tabular-nums">
                      {compact(d.value)}
                    </text>
                  )}
                </>
              )}
              <text x={cx} y={height - 8} textAnchor="middle" className="fill-[var(--color-ink-muted)] text-[10px]">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 min-h-4 text-[11px] text-ink-secondary" aria-live="polite">
        {shown ? (
          <>
            <span className="font-semibold text-ink">{shown.label}</span>{" "}
            {shown.value > 0 ? (
              <>
                · <span className="tabular-nums">{fmt.rupiah(shown.value)}</span>
                {shown.detail ? ` · ${shown.detail}` : ""}
              </>
            ) : (
              <>· {emptyLabel}</>
            )}
          </>
        ) : null}
      </p>
    </div>
  );
}

/* ── Ranked bars with a ready-made value label ──────────────────────── */

export type RankItem = {
  label: string;
  value: number;
  /** Text shown at the right edge (formatted by the page). */
  valueLabel: string;
  sublabel?: string;
};

export function RankBars({
  items,
  accent = "var(--color-chart-1)",
  className,
}: {
  items: RankItem[];
  accent?: string;
  className?: string;
}) {
  const peak = Math.max(1, ...items.map((i) => i.value));
  return (
    <ol className={cn("space-y-2", className)}>
      {items.map((item, i) => (
        <li key={item.label + i} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <span className="truncate text-xs font-medium text-ink">{item.label}</span>
            {item.sublabel && <span className="shrink-0 text-[10px] text-ink-muted">{item.sublabel}</span>}
          </div>
          <span className="text-right text-xs font-semibold tabular-nums text-ink">{item.valueLabel}</span>
          <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max(item.value > 0 ? 2 : 0, (item.value / peak) * 100)}%`, background: accent }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ── Donut with money in the legend ─────────────────────────────────── */

export type ShareSlice = { label: string; value: number; color: string };

export function ShareDonut({
  slices,
  centerLabel,
  size = 132,
  className,
}: {
  slices: ShareSlice[];
  centerLabel: string;
  size?: number;
  className?: string;
}) {
  const { fmt } = useI18n();
  const [hover, setHover] = React.useState<number | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0);
  const stroke = 15;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  return (
    <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-3", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label={slices.map((s) => `${s.label} ${pct(s.value)}%`).join(", ")}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth={stroke} />
          {total > 0 &&
            slices.map((s, i) => {
              const len = (s.value / total) * c;
              const seg = (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={hover === i ? stroke + 3 : stroke}
                  strokeDasharray={`${Math.max(0, len - (slices.length > 1 ? 2 : 0))} ${c}`}
                  strokeDashoffset={-offset}
                  className="transition-all duration-200"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              );
              offset += len;
              return seg;
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-base font-semibold tabular-nums text-ink">
            {hover !== null ? `${pct(slices[hover].value)}%` : fmt.rupiahCompact(total).replace(/^Rp\s/, "")}
          </span>
          <span className="max-w-[80%] text-[9.5px] uppercase leading-tight tracking-wider text-ink-muted">
            {hover !== null ? slices[hover].label : centerLabel}
          </span>
        </div>
      </div>
      <ul className="min-w-[10rem] flex-1 space-y-1.5">
        {slices.map((s, i) => (
          <li
            key={s.label + i}
            className="flex items-center justify-between gap-3 text-xs"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
              <span className="text-ink-secondary">{s.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-ink">
              <span className="font-semibold">{fmt.rupiahCompact(s.value)}</span>
              <span className="ml-1.5 text-ink-muted">{pct(s.value)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Stacked bar: how a whole splits into a few parts ───────────────── */

export function StackedBar({ parts, className }: { parts: ShareSlice[]; className?: string }) {
  const { fmt } = useI18n();
  const total = parts.reduce((a, p) => a + p.value, 0);
  return (
    <div className={className}>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={parts.map((p) => `${p.label} ${fmt.rupiah(p.value)}`).join(", ")}
      >
        {parts.map((p, i) =>
          p.value > 0 ? (
            <div key={p.label + i} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} className="h-full" />
          ) : null,
        )}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
        {parts.map((p, i) => (
          <li key={p.label + i} className="flex items-center gap-2 text-xs">
            <span className="size-2.5 rounded-[3px]" style={{ background: p.color }} />
            <span className="text-ink-secondary">{p.label}</span>
            <span className="font-semibold tabular-nums text-ink">{fmt.rupiah(p.value)}</span>
            {total > 0 && <span className="tabular-nums text-ink-muted">{Math.round((p.value / total) * 100)}%</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
