"use client";

import { forwardRef, type HTMLAttributes, memo } from "react";
import { cn } from "@/lib/cn";

export type BadgeVariant = "default" | "accent" | "success" | "warning" | "danger" | "outline";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

const base =
  "inline-flex items-center gap-1.5 rounded-[1px] px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.06em] leading-relaxed";

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-[var(--surface-2)] text-[var(--ink-2)]",
  accent: "bg-[var(--accent-soft)] text-[var(--accent-text)]",
  success: "bg-[var(--status-valid-bg)] text-[var(--status-valid-text)]",
  warning: "bg-[var(--status-risky-bg)] text-[var(--status-risky-text)]",
  danger: "bg-[var(--status-invalid-bg)] text-[var(--status-invalid-text)]",
  outline: "border border-[var(--line)] text-[var(--ink-2)]",
};

export const Badge = memo(
  forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
    { className, variant = "default", dot = false, children, ...props },
    ref,
  ) {
    return (
      <span ref={ref} className={cn(base, variantStyles[variant], className)} {...props}>
        {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
        {children}
      </span>
    );
  }),
);
Badge.displayName = "Badge";
