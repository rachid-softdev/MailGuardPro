"use client";

import { Code } from "lucide-react";

interface DevBadgeProps {
  className?: string;
}

export function DevBadge({ className = "" }: DevBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--accent)] ${className}`}
    >
      <Code className="h-2.5 w-2.5" aria-hidden="true" />
      DEV
    </span>
  );
}
