"use client";

import Link from "next/link";
import EmailDemo from "@/components/marketing/EmailDemo";
import { ScoreCircle } from "@/components/validator/ScoreCircle";

export function VariantB() {
  return (
    <>
      {/* Hero */}
      <section className="py-20 md:py-32">
        <div className="max-w-[var(--container-lg)] mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto">
            <h1
              className="text-4xl md:text-5xl lg:text-6xl font-display font-extrabold tracking-tight mb-6"
              style={{ letterSpacing: "-0.03em" }}
            >
              Stop Bouncing Emails. <span className="text-[var(--accent)]">Start Converting.</span>
            </h1>
            <p className="text-lg text-[var(--text-secondary)] mb-8 leading-relaxed">
              AI-powered email validation that scores every address 0–100 in real time. No fake
              leads, no wasted campaigns.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/validate" className="btn btn-accent btn-lg">
                Try Free — No Credit Card
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </Link>
              <Link href="/pricing" className="btn btn-ghost btn-md">
                View pricing
              </Link>
            </div>
            {/* Social proof bar */}
            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
              <div className="flex -space-x-1">
                {["SK", "MJ", "AL", "RP"].map((initials, i) => (
                  <div
                    key={i}
                    className="w-7 h-7 rounded-full border-2 border-[var(--bg-base)] bg-[var(--accent-light)] flex items-center justify-center text-[10px] font-bold text-[var(--accent)]"
                  >
                    {initials}
                  </div>
                ))}
              </div>
              <span>
                Trusted by <strong className="text-[var(--text-primary)]">500+</strong> teams
              </span>
            </div>
          </div>

          {/* Interactive demo */}
          <div className="mt-16 card max-w-xl mx-auto">
            <EmailDemo />
          </div>
        </div>
      </section>

      {/* Features — same cards, slightly different positioning (Bulk first, then Quality, then Export) */}
      <section className="py-20 border-t border-[var(--border)]">
        <div className="max-w-[var(--container-lg)] mx-auto px-6">
          <h2 className="text-3xl font-display font-bold text-center mb-12">
            Everything you need to clean your list
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 — Bulk Processing (first in Variant B) */}
            <div className="card flex flex-col">
              <div className="flex-1">
                <div className="w-12 h-12 bg-[var(--accent-light)] rounded-lg mb-4 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-[var(--accent)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 4v16h18V4H3zm16 4l-6 4.5L7 8"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-display font-semibold mb-2">Bulk Processing</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
                  Upload CSV files up to 100k rows. Process in background with real-time progress
                  and notifications when complete.
                </p>
              </div>
              <div className="pt-4 border-t border-[var(--border)]">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-2">
                  <span>Processing</span>
                  <span className="font-mono font-medium text-[var(--accent)]">75%</span>
                </div>
                <div className="w-full h-2.5 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-light)] transition-all"
                    style={{ width: "75%" }}
                  />
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-[var(--text-muted)]">
                  <span className="flex items-center gap-1">
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
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    12,847 valid
                  </span>
                  <span className="flex items-center gap-1">
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    342 invalid
                  </span>
                </div>
              </div>
            </div>

            {/* Feature 2 — Quality Score */}
            <div className="card relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/[0.03] to-transparent pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 bg-[var(--accent)]/10 rounded-xl flex items-center justify-center">
                    <svg
                      className="w-7 h-7 text-[var(--accent)]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                      />
                    </svg>
                  </div>
                  <ScoreCircle score={87} size="md" />
                </div>
                <h3 className="text-lg font-display font-semibold mb-2">Quality Score 0-100</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  Beyond valid/invalid — know exactly how deliverable each email is with our
                  proprietary scoring algorithm.
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs text-[var(--text-accent)]">
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
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>Includes typo detection &amp; disposable email identification</span>
                </div>
              </div>
            </div>

            {/* Feature 3 — Export */}
            <div className="card">
              <div className="w-12 h-12 bg-[var(--accent-light)] rounded-lg mb-4 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-[var(--accent)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-display font-semibold mb-2">Export in Any Format</h3>
              <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
                CSV, JSON, XLSX with formatting, or PDF reports. Choose the format that fits your
                workflow.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-subtle)] text-xs font-mono text-[var(--text-primary)]">
                  <svg
                    className="w-4 h-4 text-[var(--accent)] shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  .csv
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-subtle)] text-xs font-mono text-[var(--text-primary)]">
                  <svg
                    className="w-4 h-4 text-[var(--accent)] shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                  .json
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-subtle)] text-xs font-mono text-[var(--text-primary)]">
                  <svg
                    className="w-4 h-4 text-[var(--accent)] shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  .xlsx
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-subtle)] text-xs font-mono text-[var(--text-primary)]">
                  <svg
                    className="w-4 h-4 text-[var(--accent)] shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                  .pdf
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-20 border-t border-[var(--border)]">
        <div className="max-w-[var(--container-lg)] mx-auto px-6">
          <div className="text-center mb-12">
            <div className="text-5xl font-display font-bold text-[var(--accent)] mb-2">500+</div>
            <p className="text-lg text-[var(--text-secondary)]">
              developers trust MailGuard Pro for email validation
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            <div className="card">
              <svg
                className="w-6 h-6 text-[var(--accent)] mb-3"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10H14.017zM0 21v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151C7.563 6.068 6 8.789 6 11h4v10H0z" />
              </svg>
              <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
                &ldquo;We reduced our bounce rate by 40% after switching to MailGuard Pro. The
                quality score alone is worth it — it catches emails that other validators
                miss.&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[var(--accent-light)] rounded-full flex items-center justify-center text-sm font-bold text-[var(--accent)]">
                  SK
                </div>
                <div>
                  <p className="text-sm font-semibold">Sarah Kim</p>
                  <p className="text-xs text-[var(--text-muted)]">CTO, SendFlow</p>
                </div>
              </div>
            </div>
            <div className="card">
              <svg
                className="w-6 h-6 text-[var(--accent)] mb-3"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10H14.017zM0 21v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151C7.563 6.068 6 8.789 6 11h4v10H0z" />
              </svg>
              <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
                &ldquo;Processing 50k emails in minutes with detailed reports is incredible. The
                export options alone save our team hours every week.&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[var(--accent-light)] rounded-full flex items-center justify-center text-sm font-bold text-[var(--accent)]">
                  MJ
                </div>
                <div>
                  <p className="text-sm font-semibold">Marcus Johnson</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Email Marketing Lead, OutreachPro
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-12">
        <div className="max-w-[var(--container-lg)] mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-[var(--accent)] rounded" />
              <span className="font-display font-semibold">MailGuard Pro</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-[var(--text-muted)]">
              <Link href="/docs/api-reference" className="hover:text-[var(--text-primary)]">
                API Reference
              </Link>
              <Link href="/pricing" className="hover:text-[var(--text-primary)]">
                Pricing
              </Link>
            </div>
            <p className="text-sm text-[var(--text-muted)]">&copy; 2026 MailGuard Pro</p>
          </div>
        </div>
      </footer>
    </>
  );
}
