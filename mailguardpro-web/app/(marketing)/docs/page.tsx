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
                One REST API for single addresses and batches. Send an email, receive a calibrated
                score, the six checks, and a status you can act on.
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
                https://api.mailguard.pro/v1
              </p>
            </div>
            <div className="bg-[var(--surface)] px-4 py-3">
              <p className="label-mono">Authentication</p>
              <p className="mt-1 font-mono text-[11px] text-[var(--ink)]">X-API-Key</p>
            </div>
            <div className="bg-[var(--surface)] px-4 py-3">
              <p className="label-mono">Payload</p>
              <p className="mt-1 font-mono text-[11px] text-[var(--ink)]">JSON / multipart</p>
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
                  description="Every request carries an API key in the X-API-Key header. Keys are scoped and can be revoked from the dashboard without rotating your integration."
                />
                <p className="mt-4 text-sm leading-relaxed text-[var(--ink-2)]">
                  Generate a key under <strong className="text-[var(--ink)]">API Keys</strong>. Keep
                  it out of client-side code and version control. If a key is exposed, delete it
                  immediately and create a new one.
                </p>
                <div className="mt-4">
                  <CodeBlock
                    label="Request / headers"
                    code={`curl -X POST https://api.mailguard.pro/v1/validate \\
  -H "X-API-Key: mg_live_xxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"email": "user@example.com"}'`}
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
                  description="Inspect one address and receive a quality score from 0 to 100, the six checks, and a status. This is the same reading the dashboard displays."
                />
                <Endpoint method="POST" path="/v1/validate" />

                <Subheading>Request body</Subheading>
                <DataTable
                  columns={["Field", "Type", "Required", "Description"]}
                  rows={[
                    [
                      <InlineCode key="email">email</InlineCode>,
                      <span className="font-mono" key="type">
                        string
                      </span>,
                      "Yes",
                      "The address to inspect.",
                    ],
                    [
                      <InlineCode key="webhook">webhook_url</InlineCode>,
                      <span className="font-mono" key="type">
                        string
                      </span>,
                      "No",
                      "Optional URL to receive the result asynchronously.",
                    ],
                  ]}
                />

                <Subheading>Example response</Subheading>
                <CodeBlock
                  label="200 / application/json"
                  code={`{
  "email": "user@example.com",
  "score": 95,
  "status": "valid",
  "checks": {
    "syntax": true,
    "domain": true,
    "mx": true,
    "disposable": false,
    "typo": null
  },
  "suggestions": [],
  "meta": {
    "domain": "example.com",
    "domain_age_days": 8432,
    "is_catch_all": false
  },
  "request_id": "req_abc123def"
}`}
                />
                <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-3)]">
                  A score is always paired with status and evidence. Never gate a send on the number
                  alone.
                </p>
              </section>

              <section>
                <SectionHeading
                  index="03"
                  id="bulk-validation"
                  title="Bulk validation"
                  description="Send a CSV manifest and let the line run asynchronously. Poll the job status or subscribe to a webhook for completion."
                />
                <Endpoint method="POST" path="/v1/validate/bulk" />

                <Subheading>CSV format</Subheading>
                <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">
                  The file must include a header row with an <InlineCode>email</InlineCode> column.
                  Extra columns are preserved in the export but not inspected.
                </p>
                <div className="mt-3">
                  <CodeBlock
                    label="manifest.csv"
                    code={`email,firstName,lastName,company
alice@example.com,Alice,Smith,Acme
bob@example.org,Bob,Jones,Beta
charlie@example.net,Charlie,Lee,Gamma`}
                  />
                </div>

                <Subheading>Upload</Subheading>
                <CodeBlock
                  label="Request / multipart"
                  code={`curl -X POST https://api.mailguard.pro/v1/validate/bulk \\
  -H "X-API-Key: mg_live_xxxxxxxxxxxx" \\
  -F "file=@contacts.csv"`}
                />
                <Subheading>Accepted</Subheading>
                <CodeBlock
                  label="202 / application/json"
                  code={`{
  "job_id": "job_xyz789abc",
  "status": "queued",
  "total": 5000,
  "created_at": "2026-06-14T10:30:00Z"
}`}
                />

                <Subheading>Check a job</Subheading>
                <Endpoint method="GET" path="/v1/validate/bulk/:job_id" />
                <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">
                  Poll until <InlineCode>status</InlineCode> is <InlineCode>completed</InlineCode>{" "}
                  or <InlineCode>failed</InlineCode>. Results are paginated; exports are available
                  from the job record.
                </p>
              </section>

              <section>
                <SectionHeading
                  index="04"
                  id="webhooks"
                  title="Webhooks"
                  description="Receive a signed POST when a job finishes or a watched address changes. Deliveries are retried with exponential backoff."
                />
                <Subheading>Events</Subheading>
                <DataTable
                  columns={["Event", "Description", "Trigger"]}
                  rows={[
                    [
                      <InlineCode key="e">validation.completed</InlineCode>,
                      "Single validation result ready",
                      "After a single inspection",
                    ],
                    [
                      <InlineCode key="e">bulk.completed</InlineCode>,
                      "Bulk job finished",
                      "All rows processed",
                    ],
                    [
                      <InlineCode key="e">bulk.failed</InlineCode>,
                      "Bulk job failed",
                      "Unrecoverable batch error",
                    ],
                    [
                      <InlineCode key="e">email.updated</InlineCode>,
                      "Watched address changed",
                      "Status change on a watched address",
                    ],
                  ]}
                />

                <Subheading>Payload</Subheading>
                <CodeBlock
                  label="application/json"
                  code={`{
  "event": "validation.completed",
  "timestamp": "2026-06-14T10:30:00Z",
  "payload": {
    "email": "user@example.com",
    "score": 95,
    "status": "valid",
    "request_id": "req_abc123def"
  }
}`}
                />

                <div className="mt-4 border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3">
                  <p className="label-mono text-[var(--ink-2)]">Delivery</p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--ink-2)]">
                    Each delivery includes an <InlineCode>X-Webhook-Signature</InlineCode> header
                    using HMAC-SHA256. Verify it before processing. Failed deliveries are retried up
                    to five times.
                  </p>
                </div>
              </section>

              <section>
                <SectionHeading
                  index="05"
                  id="rate-limits"
                  title="Rate limits"
                  description="Limits apply per API key and reset daily at midnight UTC. Burst limits protect the line during short spikes."
                />
                <DataTable
                  columns={["Plan", "Requests / day", "Burst", "Bulk uploads"]}
                  rows={[
                    ["Free", "100", "10 / min", "—"],
                    ["Starter", "5,000", "100 / min", "10 / month"],
                    ["Pro", "50,000", "500 / min", "Unlimited"],
                    ["Business", "Custom", "Custom", "Unlimited"],
                  ]}
                />
                <div className="mt-4 border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                  <p className="label-mono text-[var(--ink-2)]">Response headers</p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--ink-2)]">
                    Every response includes <InlineCode>X-RateLimit-Limit</InlineCode>,{" "}
                    <InlineCode>X-RateLimit-Remaining</InlineCode>, and{" "}
                    <InlineCode>X-RateLimit-Reset</InlineCode> so your client can pace itself.
                  </p>
                </div>
              </section>
            </div>

            <div className="mt-12 flex flex-col gap-3 border-t border-[var(--line-strong)] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
                MailGuard Pro / API v1 / updated June 2026
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
