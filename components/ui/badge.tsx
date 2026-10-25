import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "brand" | "info" | "warn" | "danger" | "success" | "violet" | "magenta";

/* Monochrome: "brand" and "success" are solid black labels, every other tone is an outline. Meaning lives in the text. */
const tones: Record<Tone, string> = {
  neutral: "bg-white text-ink-secondary border-line",
  brand: "bg-black text-white border-black",
  info: "bg-white text-ink border-ink",
  warn: "bg-surface-2 text-ink border-ink",
  danger: "bg-white text-ink border-ink border-dashed",
  success: "bg-black text-white border-black",
  violet: "bg-white text-ink border-ink",
  magenta: "bg-white text-ink border-ink",
};

export function Badge({
  className,
  tone = "neutral",
  dot,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-0.5 text-[10.5px] font-semibold uppercase leading-none tracking-wider",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className="size-1.5 bg-current" aria-hidden />}
      {props.children}
    </span>
  );
}
