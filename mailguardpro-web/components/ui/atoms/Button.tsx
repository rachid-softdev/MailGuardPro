"use client";

import Link from "next/link";
import { type ButtonHTMLAttributes, forwardRef, memo, type ReactNode } from "react";
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
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium font-sans leading-none select-none rounded-[var(--radius-sm)] border border-transparent transition-colors duration-150 ease-[var(--ease-out-quart)] cursor-pointer " +
  "disabled:opacity-40 disabled:cursor-not-allowed";

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] hover:bg-[var(--ink-2)]",
  accent:
    "bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)] hover:bg-[var(--accent-hover)]",
  secondary:
    "bg-[var(--surface)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]",
  ghost:
    "bg-transparent text-[var(--ink-2)] border-[var(--line)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
  danger:
    "bg-transparent text-[var(--status-invalid-text)] border-[var(--status-invalid)] hover:bg-[var(--status-invalid-bg)]",
  link: "bg-transparent text-[var(--accent-text)] underline-offset-4 hover:underline border-0 p-0 h-auto",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-9 px-3.5 text-sm",
  lg: "h-11 px-5 text-base",
  xl: "h-[52px] px-7 text-md",
};

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
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
