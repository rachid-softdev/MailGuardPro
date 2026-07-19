"use client";

import Link from "next/link";
import { Tooltip } from "@/components/ui/Tooltip";
import { Button } from "@/components/ui";

export function MarketingHeader() {
  return (
    <header className="border-b border-[var(--border)]">
      <div className="max-w-[var(--container-xl)] mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[var(--accent)] rounded-lg" />
          <span className="font-display text-xl font-bold">MailGuard Pro</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8">
          <Link
            href="/docs"
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Docs
          </Link>
          <Link
            href="/docs/api-reference"
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            API
          </Link>
          <Link
            href="/pricing"
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Pricing
          </Link>
          <Tooltip content="Press ? in the dashboard for keyboard shortcuts" side="bottom">
            <Link
              href="/docs"
              className="w-7 h-7 rounded-md border border-[var(--border)] flex items-center justify-center text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors"
              aria-label="Keyboard shortcuts"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M6 16h.01M10 16h.01M14 16h.01M18 16h.01" />
              </svg>
            </Link>
          </Tooltip>
        </nav>
        <div className="flex items-center gap-3">
          <Button href="/login" variant="ghost" size="sm">
            Log in
          </Button>
          <Button href="/login" variant="accent" size="sm">
            Start free
          </Button>
        </div>
      </div>
    </header>
  );
}
