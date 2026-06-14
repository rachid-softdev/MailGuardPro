"use client";

import Link from "next/link";
import { Tooltip } from "@/components/ui/Tooltip";

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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                />
              </svg>
            </Link>
          </Tooltip>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="btn btn-ghost btn-sm">
            Log in
          </Link>
          <Link href="/login" className="btn btn-accent btn-sm">
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}
