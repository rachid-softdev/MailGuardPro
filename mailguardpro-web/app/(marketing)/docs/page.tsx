import { ArrowDown, ArrowUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export const metadata: Metadata = {
  title: "API Documentation — MailGuard Pro",
  description:
    "Integrate email inspection into your applications with the MailGuard Pro REST API. Single validation, bulk processing, webhooks, and more.",
};

const contents = [
  ["01", "Authentication", "authentication"],
  ["02", "Single validation", "single-validation"],
  ["03", "Bulk validation", "bulk-validation"],
  ["04", "Webhooks", "webhooks"],
  ["05", "Rate limits", "rate-limits"],
] as const;

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="border border-[var(--line-strong)] bg-[var(--surface)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2">
        <span className="label-mono text-[var(--ink-2)]">{label}</span>
        <span className="h-1 w-1 bg-[var(--accent)]" aria-hidden="true" />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12px] leading-relaxed text-[var(--ink)]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function SectionHeading({
  index,
  id,
  title,
  description,
}: {
  index: string;
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div id={id} className="scroll-mt-24 border-t border-[var(--line-strong)] pt-7">
      <p className="label-mono flex items-center gap-2.5">
        <span className="text-[var(--accent-text)]">{index}</span>
        <span className="h-px w-5 bg-[var(--line-strong)]" aria-hidden="true" />
        {title}
      </p>
      <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
        {title}
      </h2>
      <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-[var(--ink-2)]">{description}</p>
    </div>
  );
}

function Subheading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-6 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-2)]">
      {children}
    </h3>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="border border-[var(--line)] bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[11px] text-[var(--ink)]">
      {children}
    </code>
  );
}

function Endpoint({ method, path }: { method: "GET" | "POST"; path: string }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
      <span
        className={
          method === "POST"
            ? "border border-[var(--accent)] bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-text)]"
            : "border border-[var(--route)] bg-[var(--route-soft)] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--route)]"
        }
      >
        {method}
      </span>
      <code className="font-mono text-[12px] text-[var(--ink)]">{path}</code>
    </div>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="mt-3 overflow-x-auto border border-[var(--line)]">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="text-[12px] text-[var(--ink-2)]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ApiDocsPage() {
  return (
    <>
      <section className="border-b border-[var(--line)]">
        <div className="mx-auto max-w-[1280px] px-5 py-12 lg:px-8 lg:py-16">
          <p className="label-mono flex items-center gap-2.5">
            <span className="h-1.5 w-1.5 bg-[var(--accent)]" aria-hidden="true" />
            Developer desk / REST v1
          </p>
          <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h1 className="max-w-[13ch] font-display text-[clamp(2.6rem,5.4vw,4.75rem)] font-semibold leading-[0.95] tracking-[-0.045em] text-[var(--ink)]">
                Wire the{" "}
                <em className="font-normal italic text-[var(--accent-text)]">inspection</em> in.
              </h1>
              <p className="mt-4 max-w-[58ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
                One REST API for single addresses and batches. Send an email, receive a weighted
                score, eleven checks, and a status you can act on.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <a href="#single-validation" className="btn btn-primary btn-md">
                Read the endpoint reference
                <ArrowDown size={14} aria-hidden="true" />
              </a>
              <Link href="/login" className="btn btn-ghost btn-md">
                Get an API key
              </Link>
            </div>
          </div>

          <div className="mt-8 grid gap-px border border-[var(--line-strong)] bg-[var(--line)] sm:grid-cols-3">
            <div className="bg-[var(--surface)] px-4 py-3">
              <p className="label-mono">Base URL</p>
              <p className="mt-1 break-all font-mono text-[11px] text-[var(--ink)]">
                https://mailguard.pro/api/v1
              </p>
            </div>
            <div className="bg-[var(--surface)] px-4 py-3">
              <p className="label-mono">Authentication</p>
              <p className="mt-1 font-mono text-[11px] text-[var(--ink)]">X-API-Key</p>
            </div>
            <div className="bg-[var(--surface)] px-4 py-3">
              <p className="label-mono">Payload</p>
              <p className="mt-1 font-mono text-[11px] text-[var(--ink)]">Query / multipart</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1280px] px-5 py-10 lg:px-8 lg:py-14">
        <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <p className="label-mono">On this page</p>
            <nav aria-label="Documentation sections" className="mt-3 border-t border-[var(--line)]">
              {contents.map(([index, label, id]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="flex items-baseline gap-3 border-b border-[var(--line)] py-2.5 text-[12px] text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
                >
                  <span className="font-mono text-[9px] text-[var(--ink-3)]">{index}</span>
                  {label}
                </a>
              ))}
            </nav>

            <div className="mt-6 border border-[var(--line)] bg-[var(--surface)] p-4">
              <p className="label-mono">Need a key?</p>
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
                Create a scoped key from the dashboard. Keys are shown once.
              </p>
              <Link href="/api-keys" className="btn btn-accent btn-sm mt-3 w-full">
                API keys
              </Link>
            </div>
          </aside>

          <article className="min-w-0">
            <div className="space-y-10">
              <section>
                <SectionHeading
                  index="01"
                  id="authentication"
                  title="Authentication"
                  description="Single-address requests accept an API key in the X-API-Key header or a signed-in dashboard session. Keys are scoped and can be revoked from the dashboard without rotating your integration. Bulk uploads and job endpoints currently use the dashboard session."
                />
                <p className="mt-4 text-sm leading-relaxed text-[var(--ink-2)]">
                  Generate a key under <strong className="text-[var(--ink)]">API Keys</strong>. Keep
                  it out of client-side code and version control. If a key is exposed, delete it
                  immediately and create a new one.
                </p>
                <div className="mt-4">
                  <CodeBlock
                    label="Request / headers"
                    code={`curl "https://mailguard.pro/api/v1/validate?email=user%40example.com" \\
  -H "X-API-Key: mg_live_xxxxxxxxxxxx"`}
                  />
                </div>
                <div className="mt-4 border-l-2 border-[var(--status-risky)] bg-[var(--status-risky-bg)] px-4 py-3">
                  <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--status-risky-text)]">
                    Security note
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--ink-2)]">
                    Never expose a key in a browser bundle, public repository, or support ticket.
                    Regenerate compromised keys from the dashboard.
                  </p>
                </div>
              </section>

              <section>
                <SectionHeading
                  index="02"
                  id="single-validation"
                  title="Single validation"
                  description="Inspect one address and receive a quality score from 0 to 100, all eleven checks, and a status. This is the same reading the dashboard displays."
                />
                <Endpoint method="GET" path="/api/v1/validate?email=user@example.com" />

                <Subheading>Query parameters</Subheading>
                <DataTable
                  columns={["Field", "Type", "Required", "Description"]}
                  rows={[
                    [
                      <InlineCode key="email">email</InlineCode>,
                      <span className="font-mono" key="type">
                        string
                      </span>,
                      "Yes",
                      "The address to inspect. URL-encode the @ sign as %40.",
                    ],
                  ]}
                />

                <Subheading>Example response</Subheading>
                <CodeBlock
                  label="200 / application/json"
                  code={`{
  "success": true,
  "data": {
    "email": "user@example.com",
    "score": 95,
    "status": "valid",
    "checks": {
      "format": { "passed": true, "message": "Valid format" },
      "mx": { "passed": true, "message": "MX records found" },
      "smtp": { "passed": true, "message": "Mailbox accepted" },
      "catchAll": { "passed": true, "message": "Not a catch-all" },
      "disposable": { "passed": true, "message": "Not disposable" },
      "generic": { "passed": true, "message": "Not a role address" },
      "freeProvider": { "passed": true, "message": "Business domain" },
      "dnsbl": { "passed": true, "message": "Not blocklisted" },
      "spf": { "passed": true, "message": "SPF present" },
      "dmarc": { "passed": true, "message": "DMARC present" },
      "typo": { "passed": true, "message": "No typo detected" }
    },
    "domain": { "name": "example.com", "reputation": "neutral" },
    "processingTimeMs": 184,
    "algoVersion": 1
  },
  "meta": {
    "requestId": "req_abc123def",
    "processingTimeMs": 190,
    "creditsUsed": 1,
    "creditsRemaining": 4999
  }
}`}
                />
                <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-3)]">
                  A score is always paired with status and check evidence. SMTP probes can be
                  inconclusive or blocked by a provider, so never gate a send on the number alone.
                </p>
              </section>

              <section>
                <SectionHeading
                  index="03"
                  id="bulk-validation"
                  title="Bulk validation"
                  description="Upload a CSV from the dashboard and let the line run asynchronously. Poll the job status or subscribe to a webhook for completion."
                />
                <Endpoint method="POST" path="/api/v1/validate/bulk" />

                <Subheading>CSV format</Subheading>
                <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">
                  The file must include a header row with an <InlineCode>email</InlineCode> column.
                  Only that column is inspected; other columns are ignored and are not returned in
                  exports. Maximum rows depend on your plan: Starter 10,000, Pro 100,000, Business
                  100,000.
                </p>
                <div className="mt-3">
                  <CodeBlock
                    label="manifest.csv"
                    code={`email
alice@example.com
bob@example.org
charlie@example.net`}
                  />
                </div>

                <Subheading>Upload</Subheading>
                <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">
                  Send a multipart form with a <InlineCode>file</InlineCode> field from an
                  authenticated dashboard session.
                </p>
                <CodeBlock
                  label="Request / multipart"
                  code={`POST https://mailguard.pro/api/v1/validate/bulk
Cookie: <dashboard session>
Content-Type: multipart/form-data

file=@contacts.csv`}
                />
                <Subheading>Accepted</Subheading>
                <CodeBlock
                  label="200 / application/json"
                  code={`{
  "success": true,
  "requestId": "8f0c2a7e-...",
  "data": {
    "jobId": "job_xyz789abc",
    "totalEmails": 5000
  }
}`}
                />

                <Subheading>Check a job</Subheading>
                <Endpoint method="GET" path="/api/v1/bulk/:jobId/status" />
                <CodeBlock
                  label="200 / application/json"
                  code={`{
  "success": true,
  "data": {
    "id": "job_xyz789abc",
    "status": "PROCESSING",
    "totalEmails": 5000,
    "processed": 1200,
    "filename": "contacts.csv",
    "createdAt": "2026-10-26T10:30:00.000Z",
    "startedAt": "2026-10-26T10:30:02.000Z",
    "completedAt": null,
    "percentage": 24
  }
}`}
                />
                <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">
                  Poll until <InlineCode>status</InlineCode> is <InlineCode>COMPLETED</InlineCode>{" "}
                  or <InlineCode>FAILED</InlineCode>.
                </p>

                <Subheading>Results and exports</Subheading>
                <Endpoint method="GET" path="/api/v1/bulk/:jobId/results?page=1&limit=50" />
                <Endpoint method="GET" path="/api/v1/bulk/:jobId/export?format=csv" />
                <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">
                  The export endpoint accepts <InlineCode>csv</InlineCode>,{" "}
                  <InlineCode>json</InlineCode>, and <InlineCode>xlsx</InlineCode>. A PDF inspection
                  report is generated in the dashboard from the job&apos;s data.
                </p>
              </section>

              <section>
                <SectionHeading
                  index="04"
                  id="webhooks"
                  title="Webhooks"
                  description="Receive a signed POST when a bulk job finishes or fails. Deliveries are retried with exponential backoff."
                />
                <Subheading>Events</Subheading>
                <DataTable
                  columns={["Event", "Description", "Trigger"]}
                  rows={[
                    [
                      <InlineCode key="e">bulk_job_completed</InlineCode>,
                      "Bulk job finished",
                      "All rows processed",
                    ],
                    [
                      <InlineCode key="e">bulk_job_failed</InlineCode>,
                      "Bulk job failed",
                      "Unrecoverable batch error after retries",
                    ],
                  ]}
                />

                <Subheading>Payload</Subheading>
                <CodeBlock
                  label="application/json"
                  code={`{
  "event": "bulk_job_completed",
  "timestamp": "2026-10-26T10:30:00.000Z",
  "data": {
    "jobId": "job_xyz789abc",
    "totalEmails": 5000,
    "results": {
      "valid": 4210,
      "invalid": 640,
      "risky": 150
    },
    "deliveredRate": 84,
    "timestamp": "2026-10-26T10:30:00.000Z"
  }
}`}
                />

                <div className="mt-4 border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3">
                  <p className="label-mono text-[var(--ink-2)]">Delivery</p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--ink-2)]">
                    Each delivery includes an <InlineCode>X-MailGuard-Signature</InlineCode> header
                    containing the HMAC-SHA256 hex digest of the raw JSON body, plus{" "}
                    <InlineCode>X-MailGuard-Event</InlineCode> and{" "}
                    <InlineCode>X-MailGuard-Timestamp</InlineCode>. Verify the signature before
                    processing. Failed deliveries are retried up to three times, then stored for
                    manual retry from the dashboard.
                  </p>
                </div>
              </section>

              <section>
                <SectionHeading
                  index="05"
                  id="rate-limits"
                  title="Rate limits"
                  description="Limits apply per authenticated user. Single validation is limited per minute; bulk jobs, history exports, and history deletes are limited per hour. Anonymous validation is limited to 10 requests per minute per IP."
                />
                <DataTable
                  columns={["Plan", "Single validation", "Bulk jobs", "Exports", "History deletes"]}
                  rows={[
                    ["Free", "20 / min", "—", "5 / hour", "5 / hour"],
                    ["Starter", "100 / min", "5 / hour", "20 / hour", "20 / hour"],
                    ["Pro", "500 / min", "20 / hour", "100 / hour", "100 / hour"],
                    ["Business", "100,000 / min", "5,000 / hour", "5,000 / hour", "5,000 / hour"],
                  ]}
                />
                <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
                  Business limits are high-volume caps rather than literally unlimited request
                  rates. Monthly validation credits are separate from these request limits.
                </p>
                <div className="mt-4 border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                  <p className="label-mono text-[var(--ink-2)]">429 responses</p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--ink-2)]">
                    Plan-based rate-limit responses include a <InlineCode>retryAfter</InlineCode>{" "}
                    value in epoch milliseconds. Rate-limit headers are not currently emitted.
                  </p>
                </div>
              </section>
            </div>

            <div className="mt-12 flex flex-col gap-3 border-t border-[var(--line-strong)] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
                MailGuard Pro / API v1 / updated October 2026
              </p>
              <a
                href="#authentication"
                className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.04em] text-[var(--accent-text)] hover:underline"
              >
                Back to authentication
                <ArrowUp size={12} aria-hidden="true" />
              </a>
            </div>
          </article>
        </div>
      </div>

      <MarketingFooter />
    </>
  );
}
