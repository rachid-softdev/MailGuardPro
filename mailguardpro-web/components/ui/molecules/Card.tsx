"use client";

import { forwardRef, memo, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type CardVariant = "default" | "elevated" | "bordered" | "interactive";
export type CardPadding = "none" | "sm" | "md" | "lg";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
}

const base =
  "rounded-[var(--radius-xl)] border transition-all duration-200 ease-[var(--ease-out-quart)]";

const variantStyles: Record<CardVariant, string> = {
  default: "bg-[var(--bg-surface)] border-[var(--border)] shadow-[var(--shadow-sm)]",
  elevated: "bg-[var(--bg-surface)] border-transparent shadow-[var(--shadow-lg)]",
  bordered: "bg-[var(--bg-surface)] border-[var(--border)]",
  interactive:
    "bg-[var(--bg-surface)] border-[var(--border)] shadow-[var(--shadow-sm)] hover:border-[var(--border-strong)] hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] cursor-pointer",
};

const paddingStyles: Record<CardPadding, string> = {
  none: "p-0",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export const Card = memo(
  forwardRef<HTMLDivElement, CardProps>(function Card(
    { className, variant = "default", padding = "lg", children, ...props },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={cn(base, variantStyles[variant], paddingStyles[padding], className)}
        {...props}
      >
        {children}
      </div>
    );
  }),
);
Card.displayName = "Card";

export const CardHeader = memo(
  forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardHeader(
    { className, children, ...props },
    ref,
  ) {
    return (
      <div ref={ref} className={cn("flex flex-col gap-1.5 p-6", className)} {...props}>
        {children}
      </div>
    );
  }),
);
CardHeader.displayName = "CardHeader";

export const CardTitle = memo(
  forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(function CardTitle(
    { className, children, ...props },
    ref,
  ) {
    return (
      <h3
        ref={ref}
        className={cn("font-sans font-semibold text-lg tracking-tight text-[var(--text-primary)]", className)}
        {...props}
      >
        {children}
      </h3>
    );
  }),
);
CardTitle.displayName = "CardTitle";

export const CardDescription = memo(
  forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(function CardDescription(
    { className, children, ...props },
    ref,
  ) {
    return (
      <p ref={ref} className={cn("text-sm text-[var(--text-secondary)]", className)} {...props}>
        {children}
      </p>
    );
  }),
);
CardDescription.displayName = "CardDescription";

export const CardContent = memo(
  forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardContent(
    { className, children, ...props },
    ref,
  ) {
    return (
      <div ref={ref} className={cn("p-6 pt-0", className)} {...props}>
        {children}
      </div>
    );
  }),
);
CardContent.displayName = "CardContent";

export const CardFooter = memo(
  forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardFooter(
    { className, children, ...props },
    ref,
  ) {
    return (
      <div ref={ref} className={cn("flex items-center gap-3 p-6 pt-0", className)} {...props}>
        {children}
      </div>
    );
  }),
);
CardFooter.displayName = "CardFooter";
