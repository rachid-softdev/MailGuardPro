"use client";

import { forwardRef, memo, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "ref"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  href?: string;
}

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold font-sans leading-none select-none rounded-[var(--radius-md)] border border-transparent transition-all duration-200 ease-[var(--ease-out-quart)] cursor-pointer " +
  "active:translate-y-px " +
  "disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--text-primary)] text-[var(--text-inverted)] hover:bg-[var(--text-secondary)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]",
  accent:
    "bg-[var(--accent)] text-[var(--text-inverted)] hover:bg-[var(--accent-dark)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)] shadow-[0_4px_12px_var(--accent-glow)]",
  secondary:
    "bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border)] hover:border-[var(--border-strong)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-sm)]",
  ghost:
    "bg-transparent text-[var(--text-primary)] border-[var(--border)] hover:bg-[var(--bg-subtle)]",
  danger:
    "bg-[var(--status-invalid)] text-white hover:opacity-90 hover:-translate-y-0.5",
  link: "bg-transparent text-[var(--accent)] underline-offset-4 hover:underline border-0 p-0 h-auto",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base tracking-tight",
  xl: "h-14 px-8 text-lg tracking-tight",
};

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
    </svg>
  );
}

export const Button = memo(
  forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    {
      variant = "accent",
      size = "md",
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      href,
      className,
      children,
      disabled,
      ...props
    },
    ref,
  ) {
    const isDisabled = disabled || loading;
    const classes = cn(
      base,
      variantStyles[variant],
      variant !== "link" && sizeStyles[size],
      fullWidth && "w-full",
      loading && "cursor-wait",
      className,
    );

    const content = (
      <>
        {loading && <Spinner className={cn("shrink-0", size === "sm" ? "h-4 w-4" : "h-5 w-5")} />}
        {!loading && leftIcon && <span className="shrink-0">{leftIcon}</span>}
        {children}
        {!loading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </>
    );

    if (href) {
      return (
        <Link
          href={href}
          className={classes}
          aria-disabled={isDisabled || undefined}
          aria-busy={loading || undefined}
          {...(props as Record<string, unknown>)}
        >
          {content}
        </Link>
      );
    }

    return (
      <button
        ref={ref}
        className={classes}
        disabled={isDisabled}
        aria-disabled={isDisabled || undefined}
        aria-busy={loading || undefined}
        {...props}
      >
        {content}
      </button>
    );
  }),
);
Button.displayName = "Button";
