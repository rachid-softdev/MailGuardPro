import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API Documentation — MailGuard Pro",
  description:
    "Integrate email validation into your applications with the MailGuard Pro REST API. Single validation, bulk processing, webhooks, and more.",
};

const curl = (code: string) => (
  <pre className="p-4 rounded-[var(--radius-md)] bg-[#1a1a1a] text-[#e4e4e4] text-sm font-mono leading-relaxed overflow-x-auto">
    <code>{code}</code>
  </pre>
);

const sectionHeading = (text: string) => (
  <h2 className="text-2xl font-display font-bold mb-4 mt-12 first:mt-0">{text}</h2>
);

const subheading = (text: string) => (
  <h3 className="text-lg font-display font-semibold mb-2 mt-8">{text}</h3>
);

export default function ApiDocsPage() {
  return (
    <div className="py-16 md:py-24">
      <div className="max-w-[var(--container-md)] mx-auto px-6">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-display font-bold mb-3">API Documentation</h1>
          <p className="text-lg text-[var(--text-secondary)]">
            Integrate email validation into your applications
          </p>
        </div>

        {/* Base URL */}
        <section>
          <p className="text-sm text-[var(--text-muted)] mb-1 font-mono">Base URL</p>
          <p className="text-sm text-[var(--text-secondary)] font-mono">
            https://api.mailguard.pro/v1
          </p>
        </section>

        {/* Authentication */}
        {sectionHeading("Authentication")}
        <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
          All API requests require an API key passed in the{" "}
          <code className="font-mono text-sm px-1 py-0.5 rounded bg-[var(--bg-subtle)]">
            X-API-Key
          </code>{" "}
          header. Generate your API key from the dashboard under <strong>API Keys</strong>.
        </p>
        {subheading("Example Request")}
        {curl(`curl -X POST https://api.mailguard.pro/v1/validate \\
  -H "X-API-Key: mg_live_xxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"email": "user@example.com"}'`)}

        <div className="bg-[var(--status-risky-bg)] border border-[var(--status-risky)]/20 rounded-[var(--radius-md)] p-4 mt-6">
          <p className="text-sm text-[var(--status-risky)] font-semibold mb-1">Security</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Never expose your API key in client-side code, version control, or public repositories.
            Regenerate compromised keys immediately from the dashboard.
          </p>
        </div>

        {/* Single Validation */}
        {sectionHeading("Single Validation")}
        <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
          Validate a single email address and receive a quality score (0–100), syntax checks, domain
          analysis, and deliverability signals.
        </p>

        <div className="flex items-baseline gap-3 mb-4">
          <span className="px-2 py-0.5 rounded text-xs font-mono font-bold uppercase  bg-[var(--accent-light)] text-[var(--accent)]">
            POST
          </span>
          <code className="text-sm font-mono">/api/v1/validate</code>
        </div>

        {subheading("Request Body")}
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-2 pr-4 font-semibold">Field</th>
                <th className="text-left py-2 pr-4 font-semibold">Type</th>
                <th className="text-left py-2 pr-4 font-semibold">Required</th>
                <th className="text-left py-2 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody className="text-[var(--text-secondary)]">
              <tr className="border-b border-[var(--border)]">
                <td className="py-2 pr-4 font-mono">email</td>
                <td className="py-2 pr-4 font-mono">string</td>
                <td className="py-2 pr-4">Yes</td>
                <td className="py-2">The email address to validate</td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className="py-2 pr-4 font-mono">webhook_url</td>
                <td className="py-2 pr-4 font-mono">string</td>
                <td className="py-2 pr-4">No</td>
                <td className="py-2">URL to receive the result via webhook</td>
              </tr>
            </tbody>
          </table>
        </div>

        {subheading("Example Request")}
        {curl(`curl -X POST https://api.mailguard.pro/v1/validate \\
  -H "X-API-Key: mg_live_xxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"email": "user@example.com"}'`)}

        {subheading("Example Response")}
        {curl(`{
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
}`)}

        {/* Bulk Validation */}
        {sectionHeading("Bulk Validation")}
        <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
          Validate up to 100,000 emails in a single batch by uploading a CSV file. Processing runs
          asynchronously — poll the job status endpoint or subscribe via webhook for completion
          notifications.
        </p>

        <div className="flex items-baseline gap-3 mb-4">
          <span className="px-2 py-0.5 rounded text-xs font-mono font-bold uppercase  bg-[var(--status-valid-bg)] text-[var(--status-valid)]">
            POST
          </span>
          <code className="text-sm font-mono">/api/v1/validate/bulk</code>
        </div>

        {subheading("CSV Format")}
        <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
          The CSV file must contain a header row with an{" "}
          <code className="font-mono text-sm px-1 py-0.5 rounded bg-[var(--bg-subtle)]">email</code>{" "}
          column. Additional columns are ignored, allowing you to upload existing lists without
          modification.
        </p>

        {subheading("Example CSV")}
        {curl(`email
alice@example.com
bob@example.org
charlie@example.net`)}
        <div className="flex items-baseline gap-3 my-4">
          <span className="px-2 py-0.5 rounded text-xs font-mono font-bold uppercase  bg-[var(--bg-subtle)] text-[var(--text-muted)]">
            GET
          </span>
          <code className="text-sm font-mono">/api/v1/validate/bulk/:job_id</code>
        </div>
        <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
          Check the status and download results of a bulk job using the returned{" "}
          <code className="font-mono text-sm px-1 py-0.5 rounded bg-[var(--bg-subtle)]">
            job_id
          </code>
          .
        </p>

        {subheading("Bulk Upload Request")}
        {curl(`curl -X POST https://api.mailguard.pro/v1/validate/bulk \\
  -H "X-API-Key: mg_live_xxxxxxxxxxxx" \\
  -F "file=@contacts.csv"`)}
        {subheading("Bulk Upload Response")}
        {curl(`{
  "job_id": "job_xyz789abc",
  "status": "queued",
  "total": 5000,
  "created_at": "2026-06-14T10:30:00Z"
}`)}

        {/* Webhooks */}
        {sectionHeading("Webhooks")}
        <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
          Receive real-time notifications when validation jobs complete or when emails in your
          watchlist are rechecked. Configure webhook endpoints from the dashboard.
        </p>

        {subheading("Events")}
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-2 pr-4 font-semibold">Event</th>
                <th className="text-left py-2 pr-4 font-semibold">Description</th>
                <th className="text-left py-2 font-semibold">Trigger</th>
              </tr>
            </thead>
            <tbody className="text-[var(--text-secondary)]">
              <tr className="border-b border-[var(--border)]">
                <td className="py-2 pr-4 font-mono">validation.completed</td>
                <td className="py-2 pr-4">Single validation result ready</td>
                <td className="py-2">After a single email validation</td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className="py-2 pr-4 font-mono">bulk.completed</td>
                <td className="py-2 pr-4">Bulk validation finished</td>
                <td className="py-2">All rows in a batch have been processed</td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className="py-2 pr-4 font-mono">bulk.failed</td>
                <td className="py-2 pr-4">Bulk validation job failed</td>
                <td className="py-2">When a batch encounters an unrecoverable error</td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className="py-2 pr-4 font-mono">email.updated</td>
                <td className="py-2 pr-4">Email status changed</td>
                <td className="py-2">When a watched email&apos;s status changes</td>
              </tr>
            </tbody>
          </table>
        </div>

        {subheading("Payload Format")}
        {curl(`{
  "event": "validation.completed",
  "timestamp": "2026-06-14T10:30:00Z",
  "payload": {
    "email": "user@example.com",
    "score": 95,
    "status": "valid",
    "request_id": "req_abc123def"
  }
}`)}

        <div className="bg-[var(--bg-subtle)] border border-[var(--border)] rounded-[var(--radius-md)] p-4 mt-6">
          <p className="text-sm font-semibold mb-1">Delivery</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Webhooks are delivered with a signature header{" "}
            <code className="font-mono text-xs px-1 py-0.5 rounded bg-[var(--bg-surface)]">
              X-Webhook-Signature
            </code>{" "}
            using HMAC-SHA256. Verify the signature before processing. Failed deliveries are retried
            up to 5 times with exponential backoff.
          </p>
        </div>

        {/* Rate Limits */}
        {sectionHeading("Rate Limits")}
        <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
          Rate limits vary by plan. Limits apply per API key and reset daily at midnight UTC.
        </p>

        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-2 pr-4 font-semibold">Plan</th>
                <th className="text-left py-2 pr-4 font-semibold">Requests / day</th>
                <th className="text-left py-2 pr-4 font-semibold">Burst limit</th>
                <th className="text-left py-2 font-semibold">Bulk uploads</th>
              </tr>
            </thead>
            <tbody className="text-[var(--text-secondary)]">
              <tr className="border-b border-[var(--border)]">
                <td className="py-2 pr-4 font-medium">Free</td>
                <td className="py-2 pr-4 font-mono">100</td>
                <td className="py-2 pr-4 font-mono">10/min</td>
                <td className="py-2 font-mono">—</td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className="py-2 pr-4 font-medium">Starter</td>
                <td className="py-2 pr-4 font-mono">5,000</td>
                <td className="py-2 pr-4 font-mono">100/min</td>
                <td className="py-2 font-mono">10/month</td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className="py-2 pr-4 font-medium">Pro</td>
                <td className="py-2 pr-4 font-mono">50,000</td>
                <td className="py-2 pr-4 font-mono">500/min</td>
                <td className="py-2 font-mono">Unlimited</td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className="py-2 pr-4 font-medium">Enterprise</td>
                <td className="py-2 pr-4 font-mono">Custom</td>
                <td className="py-2 pr-4 font-mono">Custom</td>
                <td className="py-2 font-mono">Unlimited</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bg-[var(--status-valid-bg)] border border-[var(--status-valid)]/20 rounded-[var(--radius-md)] p-4">
          <p className="text-sm text-[var(--status-valid)] font-semibold mb-1">
            Rate limit headers
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            Every response includes{" "}
            <code className="font-mono text-xs px-1 py-0.5 rounded bg-[var(--bg-surface)]">
              X-RateLimit-Limit
            </code>
            ,{" "}
            <code className="font-mono text-xs px-1 py-0.5 rounded bg-[var(--bg-surface)]">
              X-RateLimit-Remaining
            </code>
            , and{" "}
            <code className="font-mono text-xs px-1 py-0.5 rounded bg-[var(--bg-surface)]">
              X-RateLimit-Reset
            </code>{" "}
            headers so you can track usage programmatically.
          </p>
        </div>
      </div>
    </div>
  );
}
