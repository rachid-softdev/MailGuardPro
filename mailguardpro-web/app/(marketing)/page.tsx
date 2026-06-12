"use client";

import Link from "next/link";
import EmailDemo from "@/components/marketing/EmailDemo";
import { ScoreCircle } from "@/components/validator/ScoreCircle";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Header */}
      <header className="border-b border-[var(--border)]">
        <div className="max-w-[var(--container-xl)] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[var(--accent)] rounded-lg" />
            <span className="font-display text-xl font-bold">MailGuard Pro</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <Link
              href="/docs"
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Documentation
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

      {/* Hero */}
      <section className="py-20 md:py-32">
        <div className="max-w-[var(--container-lg)] mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto">
            <h1
              className="animate-fade-up text-4xl md:text-5xl lg:text-6xl font-display font-extrabold tracking-tight mb-6"
              style={{ letterSpacing: "-0.03em", animationDelay: "0ms", opacity: 0 }}
            >
              Your email list is <span className="text-[var(--accent)]">lying to you</span>
            </h1>
            <p
              className="animate-fade-up text-lg text-[var(--text-secondary)] mb-8 leading-relaxed"
              style={{ animationDelay: "100ms", opacity: 0 }}
            >
              Get more than just &quot;valid/invalid&quot;. Our quality score (0-100) tells you
              exactly how deliverable each email is, with actionable recommendations.
            </p>
            <div
              className="animate-fade-up flex flex-col sm:flex-row items-center justify-center gap-4"
              style={{ animationDelay: "200ms", opacity: 0 }}
            >
              <Link href="/validate" className="btn btn-accent btn-lg">
                Try it now
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
          </div>

          {/* Interactive demo */}
          <div className="mt-16 card max-w-xl mx-auto">
            <EmailDemo />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 border-t border-[var(--border)]">
        <div className="max-w-[var(--container-lg)] mx-auto px-6">
          <h2 className="text-3xl font-display font-bold text-center mb-12">Why MailGuard Pro?</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 — Quality Score */}
            <div className="card animate-fade-up" style={{ animationDelay: "0ms", opacity: 0 }}>
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-[var(--accent-light)] rounded-lg flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-[var(--accent)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
                <ScoreCircle score={87} size="sm" />
              </div>
              <h3 className="text-lg font-display font-semibold mb-2">Quality Score 0-100</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                Beyond valid/invalid — know exactly how deliverable each email is with our
                proprietary scoring algorithm.
              </p>
            </div>

            {/* Feature 2 — Bulk Processing */}
            <div className="card animate-fade-up" style={{ animationDelay: "100ms", opacity: 0 }}>
              <div className="w-12 h-12 bg-[var(--accent-light)] rounded-lg mb-4 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-[var(--accent)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-display font-semibold mb-2">Bulk Processing</h3>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                Upload CSV files up to 100k rows. Process in background with real-time progress and
                notifications.
              </p>
              <div className="w-full h-2 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: "75%" }} />
              </div>
            </div>

            {/* Feature 3 — Export */}
            <div className="card animate-fade-up" style={{ animationDelay: "200ms", opacity: 0 }}>
              <div className="w-12 h-12 bg-[var(--accent-light)] rounded-lg mb-4 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-[var(--accent)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-display font-semibold mb-2">Export in Any Format</h3>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                CSV, JSON, XLSX with formatting, or PDF reports. Choose the format that fits your
                workflow.
              </p>
              <div className="flex gap-1.5 flex-wrap">
                <span className="badge badge-accent">CSV</span>
                <span className="badge badge-accent">JSON</span>
                <span className="badge badge-accent">XLSX</span>
                <span className="badge badge-accent">PDF</span>
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
              <Link href="/docs" className="hover:text-[var(--text-primary)]">
                Docs
              </Link>
              <Link href="/pricing" className="hover:text-[var(--text-primary)]">
                Pricing
              </Link>
              <Link href="/api/v1/tools/mx" className="hover:text-[var(--text-primary)]">
                MX Lookup
              </Link>
              <Link href="/api/v1/tools/spf" className="hover:text-[var(--text-primary)]">
                SPF Lookup
              </Link>
            </div>
            <p className="text-sm text-[var(--text-muted)]">&copy; 2026 MailGuard Pro</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
