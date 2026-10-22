"use client";

import { forwardRef, type InputHTMLAttributes, memo } from "react";
import { cn } from "@/lib/cn";

export type InputVariant = "outlined" | "filled" | "flushed";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant;
  error?: boolean;
}

const base =
  "w-full h-[38px] rounded-[var(--radius-sm)] font-mono text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] transition-colors duration-150 outline-none";

const variantStyles: Record<InputVariant, string> = {
  outlined: "bg-[var(--surface)] border px-3",
  filled: "bg-[var(--surface-2)] border border-transparent px-3",
  flushed: "bg-transparent border-0 border-b border-[var(--line)] rounded-none px-0",
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
            : "border-[var(--line)] hover:border-[var(--line-strong)] focus:border-[var(--line-focus)]",
          className,
        )}
        {...props}
      />
    );
  }),
);
Input.displayName = "Input";
