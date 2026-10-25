"use client";

import * as React from "react";
import { useI18n } from "@/lib/i18n/client";
import { niceCeil } from "./charts";

export type GroupedDatum = { label: string; values: number[] };
export type GroupedSeries = { label: string; /** "solid" is black, "hatch" is a hatched grey, "light" an outlined light grey. */ style: "solid" | "hatch" | "light" };

/**
 * Side-by-side columns for a few series per period (income vs expense per month). Series differ by fill
 * pattern, not hue, so the chart reads in black and white and when printed.
 */
export function GroupedColumns({
  data,
  series,
  height = 230,
  summary,
}: {
  data: GroupedDatum[];
  series: GroupedSeries[];
  height?: number;
  summary: string;
}) {
  const { fmt } = useI18n();
  const id = React.useId().replace(/:/g, "");
  const [active, setActive] = React.useState<number | null>(null);
  const W = 640;
  const padL = 44;
  const padR = 8;
  const padT = 14;
  const padB = 26;
  const max = niceCeil(Math.max(...data.flatMap((d) => d.values), 1) * 1.05);
  const ticks = 4;
  const slot = (W - padL - padR) / Math.max(1, data.length);
  const groupW = Math.min(64, slot * 0.72);
  const barW = groupW / series.length;
  const y = (v: number) => padT + (1 - v / max) * (height - padT - padB);
  const compact = (v: number) => fmt.rupiahCompact(v).replace(/^Rp\s/, "");
  const fill = (style: GroupedSeries["style"]) => (style === "solid" ? "#000" : style === "hatch" ? `url(#hatch-${id})` : "#d4d4d4");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label={summary}>
        <defs>
          <pattern id={`hatch-${id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#fff" />
            <rect width="2" height="6" fill="#000" />
          </pattern>
        </defs>
        {Array.from({ length: ticks + 1 }, (_, i) => (max / ticks) * i).map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--color-grid)" strokeWidth={1} />
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" className="fill-[var(--color-ink-muted)] text-[9px] tabular-nums">
              {compact(v)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + slot * i + slot / 2;
          const x0 = cx - groupW / 2;
          return (
            <g key={d.label + i} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
              <rect x={padL + slot * i} y={padT} width={slot} height={height - padT - padB} fill="transparent" />
              {d.values.map((v, s) => (
                <rect
                  key={s}
                  x={x0 + barW * s + 1}
                  y={y(v)}
                  width={Math.max(1, barW - 2)}
                  height={Math.max(v > 0 ? 1 : 0, height - padB - y(v))}
                  fill={fill(series[s].style)}
                  stroke="#000"
                  strokeWidth={series[s].style === "solid" ? 0 : 1}
                  opacity={active === null || active === i ? 1 : 0.45}
                />
              ))}
              <text x={cx} y={height - 8} textAnchor="middle" className="fill-[var(--color-ink-muted)] text-[10px]">
                {d.label}
              </text>
            </g>
          );
        })}
        <line x1={padL} x2={W - padR} y1={height - padB} y2={height - padB} stroke="#000" strokeWidth={1} />
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-2 text-ink-secondary">
            <svg width="14" height="14" aria-hidden>
              <rect x="0.5" y="0.5" width="13" height="13" fill={fill(s.style)} stroke="#000" strokeWidth={s.style === "solid" ? 0 : 1} />
            </svg>
            {s.label}
          </span>
        ))}
        <span className="ml-auto min-h-4 text-ink-muted tabular-nums">
          {active !== null &&
            `${data[active].label}: ${series.map((s, i) => `${s.label} ${fmt.rupiah(data[active].values[i])}`).join(" · ")}`}
        </span>
      </div>
    </div>
  );
}
