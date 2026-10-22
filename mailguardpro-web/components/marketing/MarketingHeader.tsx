"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand/BrandMark";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const navItems = [
  { href: "/#anatomy", label: "Product" },
  { href: "/#workflow", label: "Workflow" },
  { href: "/#api", label: "API" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
] as const;

export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--bg)]">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-6 px-5 lg:px-8">
        <Link href="/" className="shrink-0" aria-label="MailGuard Pro home">
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Primary">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-2 text-[13px] font-medium text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <ThemeToggle compact />
          <Link
            href="/login"
            className="hidden px-2 py-2 text-[13px] font-medium text-[var(--ink-2)] transition-colors hover:text-[var(--ink)] sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/login"
            className="hidden h-8 items-center rounded-[var(--radius-sm)] bg-[var(--ink)] px-3.5 text-[13px] font-medium text-[var(--bg)] transition-colors hover:bg-[var(--ink-2)] sm:inline-flex"
          >
            Start free
          </Link>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--line)] text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {open && (
        <div
          id="mobile-menu"
          className="animate-fade-slide-in border-t border-[var(--line)] bg-[var(--bg)] px-5 pb-5 pt-2 lg:hidden"
        >
          <nav className="flex flex-col" aria-label="Mobile">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="border-b border-[var(--line)] py-3.5 text-[15px] font-medium text-[var(--ink)] transition-colors hover:text-[var(--accent-text)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 flex gap-2">
            <Link
              href="/login"
              className="inline-flex h-10 flex-1 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--line)] text-[13px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="inline-flex h-10 flex-1 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--ink)] text-[13px] font-medium text-[var(--bg)] transition-colors hover:bg-[var(--ink-2)]"
            >
              Start free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
