"use client";

import Link from "next/link";

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
