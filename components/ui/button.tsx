import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "dark" | "secondary" | "outline" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-black text-white font-semibold hover:bg-night-2 border border-black",
  dark: "bg-black text-white font-semibold hover:bg-night-2 border border-black",
  secondary: "bg-white text-ink font-medium hover:bg-surface-2 border border-ink",
  outline: "border border-ink bg-white text-ink font-medium hover:bg-ink hover:text-white",
  ghost: "text-ink-secondary hover:text-ink hover:bg-elevated border border-transparent",
  subtle: "bg-surface-2 text-ink-secondary hover:text-ink hover:bg-elevated border border-line",
  danger: "border border-ink bg-white text-ink font-semibold underline decoration-1 underline-offset-2 hover:bg-ink hover:text-white hover:no-underline",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-5 text-sm gap-2",
  lg: "h-12 px-7 text-sm gap-2",
  icon: "h-10 w-10",
};

export function buttonClass({
  variant = "primary",
  size = "md",
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(
    "inline-flex items-center justify-center whitespace-nowrap transition-colors outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
    variants[variant],
    sizes[size],
    className,
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Render an anchor / next-link with button styling. */
  asChild?: boolean;
  href?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", asChild, href, children, ...props }, ref) => {
    const cls = buttonClass({ variant, size, className });

    if (href) {
      return (
        <Link href={href} className={cls}>
          {children}
        </Link>
      );
    }

    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ className?: string }>;
      return React.cloneElement(child, { className: cn(cls, child.props.className) });
    }

    return (
      <button ref={ref} className={cls} {...props}>
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
