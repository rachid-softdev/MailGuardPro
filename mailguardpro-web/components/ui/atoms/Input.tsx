"use client";

import { forwardRef, memo, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type InputVariant = "outlined" | "filled" | "flushed";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant;
  error?: boolean;
}

const base =
  "w-full rounded-[var(--radius-md)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all duration-150 outline-none focus:ring-0";

const variantStyles: Record<InputVariant, string> = {
  outlined: "bg-[var(--bg-surface)] border px-3 py-2",
  filled: "bg-[var(--bg-subtle)] border border-transparent px-3 py-2",
  flushed: "bg-transparent border-0 border-b border-[var(--border)] rounded-none px-0 py-2",
};

export const Input = memo(
  forwardRef<HTMLInputElement, InputProps>(function Input(
    { className, variant = "outlined", error = false, ...props },
    ref,
  ) {
    return (
      <input
        ref={ref}
        aria-invalid={error || undefined}
        className={cn(
          base,
          variantStyles[variant],
          error
            ? "border-[var(--status-invalid)] focus:border-[var(--status-invalid)]"
            : "border-[var(--border)] hover:border-[var(--border-strong)] focus:border-[var(--border-focus)]",
          className,
        )}
        {...props}
      />
    );
  }),
);
Input.displayName = "Input";
