"use client";

import { forwardRef, memo, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type BadgeVariant = "default" | "accent" | "success" | "warning" | "danger" | "outline";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

const base = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium";

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
  accent: "bg-[var(--accent-light)] text-[var(--accent)]",
  success: "bg-[var(--status-valid-bg)] text-[var(--status-valid)]",
  warning: "bg-[var(--status-risky-bg)] text-[var(--status-risky)]",
  danger: "bg-[var(--status-invalid-bg)] text-[var(--status-invalid)]",
  outline: "border border-[var(--border)] text-[var(--text-secondary)]",
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
