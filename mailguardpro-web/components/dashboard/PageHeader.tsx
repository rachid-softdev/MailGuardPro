import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}

/**
 * Shared instrument header for the app. One eyebrow, one title, one optional
 * ledger strip. Keeps every surface on the same baseline without inventing a
 * new hero for each page.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("mb-5", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="label-mono flex items-center gap-2">
            <span className="h-1.5 w-1.5 bg-[var(--accent)]" aria-hidden="true" />
            {eyebrow}
          </p>
          <h1 className="mt-2 font-display text-[clamp(1.9rem,3.2vw,2.6rem)] font-semibold leading-none tracking-[-0.04em] text-[var(--ink)]">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-[var(--ink-2)]">
              {description}
            </p>
          )}
        </div>

        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {meta && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--line)] pt-3">
          {meta}
        </div>
      )}
    </header>
  );
}
