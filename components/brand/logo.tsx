import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { LOCKUP, MARK, WORDMARK } from "./logo-paths";

type Shape = { readonly w: number; readonly h: number; readonly d: string };

/** One traced shape drawn in `currentColor`, so it follows the text colour (black on white, white on black). */
function Shape({ shape, className, title }: { shape: Shape; className?: string; title?: string }) {
  return (
    <svg
      viewBox={`0 0 ${shape.w} ${shape.h}`}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn("block shrink-0", className)}
      fill="currentColor"
    >
      <path fillRule="evenodd" d={shape.d} />
    </svg>
  );
}

/** The emblem alone (ball + rising chart). Height drives the size; width follows the artwork. */
export function LogoMark({ className, invert }: { className?: string; invert?: boolean }) {
  return <Shape shape={MARK} className={cn("h-9 w-auto", invert ? "text-white" : "text-black", className)} />;
}

/** Emblem + wordmark side by side, for bars and headers. `invert` is for black backgrounds; `compact` drops the wordmark. */
export function Logo({ className, invert, compact }: { className?: string; invert?: boolean; compact?: boolean }) {
  return (
    <span
      role="img"
      aria-label={BRAND.name}
      className={cn("inline-flex items-center gap-3", invert ? "text-white" : "text-black", className)}
    >
      <Shape shape={MARK} className="h-9 w-auto" />
      {!compact && <Shape shape={WORDMARK} className="h-[15px] w-auto" />}
    </span>
  );
}

/** The full stacked artwork (emblem over wordmark), for large surfaces such as the sign-in page. Width drives the size. */
export function LogoLockup({ className, invert }: { className?: string; invert?: boolean }) {
  return <Shape shape={LOCKUP} title={BRAND.name} className={cn("h-auto w-56", invert ? "text-white" : "text-black", className)} />;
}
