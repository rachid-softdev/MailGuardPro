import Link from "next/link";
import { Wordmark } from "@/components/brand/BrandMark";
import { SCORE_BANDS } from "@/lib/score";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/#anatomy", label: "Quality score" },
      { href: "/#workflow", label: "Bulk workflow" },
      { href: "/#api", label: "API" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/docs", label: "Documentation" },
      { href: "/docs#single-validation", label: "API reference" },
      { href: "/dashboard", label: "Dashboard" },
    ],
  },
  {
    title: "Get started",
    links: [
      { href: "/login", label: "Create an account" },
      { href: "/login", label: "Sign in" },
      { href: "/pricing", label: "Compare plans" },
    ],
  },
] as const;

export function MarketingFooter() {
  return (
    <footer className="border-t border-[var(--line)] bg-[var(--bg)]">
      <div className="mx-auto max-w-[1280px] px-5 py-14 lg:px-8 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-12">
          <div>
            <Link href="/" aria-label="MailGuard Pro home">
              <Wordmark />
            </Link>
            <p className="mt-4 max-w-[34ch] text-sm leading-relaxed text-[var(--ink-2)]">
              Email inspection for lists that have to land. One score, six checks, no guesswork.
            </p>

            <div className="mt-6">
              <p className="label-mono">The scale</p>
              <div className="mt-2 flex h-2.5 w-full max-w-[260px] gap-[2px]" aria-hidden="true">
                {SCORE_BANDS.map((band) => (
                  <span
                    key={band.short}
                    style={{ width: `${band.span}%`, backgroundColor: band.color }}
                  />
                ))}
              </div>
              <div className="mt-1.5 flex w-full max-w-[260px] justify-between font-mono text-[9px] text-[var(--ink-3)]">
                <span>0</span>
                <span>25</span>
                <span>50</span>
                <span>75</span>
                <span>100</span>
              </div>
            </div>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <p className="label-mono">{column.title}</p>
              <ul className="mt-3 space-y-2.5">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="text-sm text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-[var(--line)] pt-5 text-[11px] text-[var(--ink-3)] sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; 2026 MailGuard Pro. All rights reserved.</p>
          <p className="font-mono uppercase tracking-[0.06em]">Inspected, scored, sorted.</p>
        </div>
      </div>
    </footer>
  );
}
