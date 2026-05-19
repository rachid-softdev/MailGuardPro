import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "MailGuard Pro - Email Validation API | Quality Score 0-100",
  description:
    "Validate email addresses with 99% accuracy. Get a quality score (0-100), detect disposable emails, catch typos, and verify deliverability. Free tier available.",
  keywords: [
    "email validation",
    "email verifier",
    "email checker",
    "bulk email validation",
    "email quality score",
    "deliverability",
  ],
  openGraph: {
    title: "MailGuard Pro - Email Intelligence Platform",
    description:
      "Validate emails with quality scores. Bulk processing, API access, and exports in CSV/JSON/XLSX/PDF.",
    url: "https://mailguard.pro",
    siteName: "MailGuard Pro",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MailGuard Pro - Email Validation",
    description:
      "Quality scores for your email list. Validate 0-100 with actionable recommendations.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

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
              className="text-4xl md:text-5xl lg:text-6xl font-display font-extrabold tracking-tight mb-6"
              style={{ letterSpacing: "-0.03em" }}
            >
              Your email list is <span className="text-[var(--accent)]">lying to you</span>
            </h1>
            <p className="text-lg text-[var(--text-secondary)] mb-8 leading-relaxed">
              Get more than just &quot;valid/invalid&quot;. Our quality score (0-100) tells you
              exactly how deliverable each email is, with actionable recommendations.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/validate" className="btn btn-accent btn-lg">
                Try it now
              </Link>
              <Link href="/pricing" className="btn btn-ghost btn-lg">
                View pricing
              </Link>
            </div>
          </div>

          {/* Demo placeholder */}
          <div className="mt-16 card max-w-xl mx-auto">
            <div className="text-center py-8">
              <p className="text-[var(--text-muted)] mb-4">Enter an email to see the score</p>
              <div className="flex gap-2 max-w-md mx-auto">
                <input type="email" placeholder="test@example.com" className="input flex-1" />
                <button className="btn btn-accent">Analyze</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 border-t border-[var(--border)]">
        <div className="max-w-[var(--container-lg)] mx-auto px-6">
          <h2 className="text-3xl font-display font-bold text-center mb-12">Why MailGuard Pro?</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="card">
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
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-display font-semibold mb-2">Quality Score 0-100</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                Beyond valid/invalid — know exactly how deliverable each email is with our
                proprietary scoring algorithm.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="card">
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
              <p className="text-sm text-[var(--text-secondary)]">
                Upload CSV files up to 100k rows. Process in background with real-time progress and
                notifications.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="card">
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
              <p className="text-sm text-[var(--text-secondary)]">
                CSV, JSON, XLSX with formatting, or PDF reports. Choose the format that fits your
                workflow.
              </p>
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
            <p className="text-sm text-[var(--text-muted)]">© 2026 MailGuard Pro</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
