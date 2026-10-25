import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Square monogram. */
export function LogoMark({ className, invert }: { className?: string; invert?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center text-[17px] font-black leading-none",
        invert ? "bg-white text-black" : "bg-black text-white",
        className,
      )}
    >
      F
    </span>
  );
}

/** Monogram + two-line wordmark. `invert` is for black backgrounds. */
export function Logo({ className, invert, compact }: { className?: string; invert?: boolean; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark invert={invert} />
      {!compact && (
        <span className="leading-none">
          <span className={cn("block text-[15px] font-extrabold tracking-[0.2em]", invert ? "text-white" : "text-ink")}>{BRAND.wordmark.top}</span>
          <span className={cn("mt-1 block text-[9px] font-semibold tracking-[0.42em]", invert ? "text-white/70" : "text-ink-muted")}>
            {BRAND.wordmark.bottom}
          </span>
        </span>
      )}
    </span>
  );
}
