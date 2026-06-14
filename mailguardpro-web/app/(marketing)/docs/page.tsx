import Link from "next/link";

export default function DocsPage() {
  return (
    <div className="py-16 md:py-24">
      <div className="max-w-[var(--container-md)] mx-auto px-6">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-display font-bold mb-3">Documentation</h1>
          <p className="text-lg text-[var(--text-secondary)]">
            Everything you need to know about MailGuard Pro
          </p>
        </div>

        {/* Getting Started */}
        <section className="mb-12">
          <h2 className="text-2xl font-display font-semibold mb-4">Getting Started</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card">
              <h3 className="font-display font-semibold mb-2">Quick Start</h3>
              <ol className="text-sm text-[var(--text-secondary)] space-y-2 list-decimal list-inside">
                <li>Create a free account</li>
                <li>Paste an email address in the validator</li>
                <li>Review the quality score and recommendations</li>
                <li>Upload a CSV for bulk validation</li>
                <li>Export results in your preferred format</li>
              </ol>
            </div>
            <div className="card">
              <h3 className="font-display font-semibold mb-2">Need Help?</h3>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                Check our API reference for developer integration, or contact support for account
                questions.
              </p>
              <Link href="/docs/api-reference" className="btn btn-accent btn-sm">
                API Reference
              </Link>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mb-12">
          <h2 className="text-2xl font-display font-semibold mb-4">Features</h2>
          <div className="space-y-6">
            <div className="card">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-[var(--accent-light)] rounded-lg flex items-center justify-center shrink-0 mt-1">
                  <svg
                    className="w-5 h-5 text-[var(--accent)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-display font-semibold mb-1">Quality Score</h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Each email receives a score from 0-100 based on multiple signals: syntax
                    validity, domain reputation, mailbox existence, and known patterns. Scores above
                    80 indicate highly deliverable addresses.
                  </p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-[var(--accent-light)] rounded-lg flex items-center justify-center shrink-0 mt-1">
                  <svg
                    className="w-5 h-5 text-[var(--accent)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 4v16h18V4H3zm16 4l-6 4.5L7 8"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-display font-semibold mb-1">Bulk Validation</h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Upload CSV files with up to 100,000 rows. Processing happens in the background
                    with real-time progress updates. You&apos;ll receive a notification when your
                    job completes.
                  </p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-[var(--accent-light)] rounded-lg flex items-center justify-center shrink-0 mt-1">
                  <svg
                    className="w-5 h-5 text-[var(--accent)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-display font-semibold mb-1">Export Options</h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Export validation results in CSV, JSON, XLSX (with formatting), or PDF format.
                    Choose the format that integrates with your workflow. Exports include all
                    metadata and scores.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-12">
          <h2 className="text-2xl font-display font-semibold mb-4">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {[
              {
                q: "What does the quality score mean?",
                a: "The quality score ranges from 0-100. Scores 80+ are highly deliverable. 60-79 may reach inbox but with reduced confidence. Below 60 should be reviewed — these emails may bounce or harm your sender reputation.",
              },
              {
                q: "Is my data secure?",
                a: "Yes. All data is encrypted in transit (TLS 1.3) and at rest (AES-256). We never store email lists beyond the retention period you select. We are GDPR compliant.",
              },
              {
                q: "How does bulk processing work?",
                a: "Upload a CSV with one email per row. Processing runs in the background, and you can check progress in real-time. When complete, download results with scores and statuses for every email.",
              },
              {
                q: "Can I integrate with my application?",
                a: "Yes. Use our REST API to validate emails programmatically. Generate an API key from the dashboard and refer to the API Reference for endpoints and usage limits.",
              },
              {
                q: "What happens when I run out of credits?",
                a: "You&apos;ll receive a notification at 80% usage. Validations pause when credits are exhausted. You can purchase additional credits or upgrade your plan at any time.",
              },
            ].map((faq, i) => (
              <details key={i} className="card group open:ring-1 open:ring-[var(--accent)]/20">
                <summary className="list-none cursor-pointer font-display font-semibold py-3 px-4 flex items-center justify-between gap-4">
                  {faq.q}
                  <svg
                    className="w-4 h-4 text-[var(--text-muted)] shrink-0 group-open:rotate-180 transition-transform"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </summary>
                <p className="text-sm text-[var(--text-secondary)] px-4 pb-4 leading-relaxed">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
