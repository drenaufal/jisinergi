import * as React from "react";
import { StatCard, type StatBlock } from "@/components/app/page-header";

/**
 * A StatCard sized for Rupiah. The headline is the compact figure ("Rp 265,2 jt") so it fits any tile;
 * the exact amount is in the tooltip and, for screen readers, in `full`.
 */
export function Kpi({
  label,
  value,
  full,
  hint,
  icon,
  block = "white",
  tone,
}: {
  label: string;
  value: string;
  /** The exact figure, e.g. "Rp 265.200.000". */
  full?: string;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  block?: StatBlock;
  tone?: "default" | "brand" | "warn" | "danger";
}) {
  return (
    <StatCard
      label={label}
      block={block}
      icon={icon}
      tone={tone}
      hint={hint}
      value={
        <span title={full} className="block truncate text-[22px] sm:text-[26px]">
          {value}
          {full && <span className="sr-only"> ({full})</span>}
        </span>
      }
    />
  );
}
