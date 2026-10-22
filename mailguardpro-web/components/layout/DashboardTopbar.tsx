"use client";

import { Menu, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand/BrandMark";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const labels: Record<string, string> = {
  dashboard: "Dashboard",
  validate: "Validate",
  bulk: "Bulk",
  history: "History",
  "api-keys": "API keys",
  webhooks: "Webhooks",
  billing: "Billing",
  settings: "Settings",
  admin: "Admin",
};

function labelFor(segment: string) {
  return labels[segment] ?? segment.replace(/-/g, " ");
}

interface DashboardTopbarProps {
  onOpenMenu: () => void;
  onOpenSearch: () => void;
}

export function DashboardTopbar({ onOpenMenu, onOpenSearch }: DashboardTopbarProps) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <header className="sticky top-0 z-20 flex h-[var(--topbar-height)] items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--bg)] px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenMenu}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] md:hidden"
          aria-label="Open sidebar"
        >
          <Menu size={18} />
        </button>

        <Link href="/dashboard" className="md:hidden" aria-label="MailGuard Pro dashboard">
          <Wordmark size="sm" />
        </Link>

        <nav className="hidden min-w-0 items-center gap-2 md:flex" aria-label="Breadcrumb">
          <Link
            href="/dashboard"
            className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
          >
            Mailguard
          </Link>
          {segments.map((segment, index) => {
            const href = "/" + segments.slice(0, index + 1).join("/");
            const isLast = index === segments.length - 1;
            return (
              <span key={href} className="flex min-w-0 items-center gap-2">
                <span className="text-[var(--line-strong)]" aria-hidden="true">
                  /
                </span>
                {isLast ? (
                  <span className="truncate text-[12px] font-medium capitalize text-[var(--ink)]">
                    {labelFor(segment)}
                  </span>
                ) : (
                  <Link
                    href={href}
                    className="truncate text-[12px] text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
                  >
                    {labelFor(segment)}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenSearch}
          className="hidden h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[11px] text-[var(--ink-3)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink-2)] sm:flex sm:w-[190px]"
          aria-label="Open command palette"
        >
          <Search size={13} aria-hidden="true" />
          <span className="flex-1 text-left">Search or jump</span>
          <kbd className="kbd">⌘K</kbd>
        </button>

        <button
          type="button"
          onClick={onOpenSearch}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] sm:hidden"
          aria-label="Search"
        >
          <Search size={16} />
        </button>

        <ThemeToggle compact />
        <NotificationBell direction="down" />
      </div>
    </header>
  );
}
