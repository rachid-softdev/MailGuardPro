import { ArrowDown, ArrowRight, ArrowUpRight, Check, KeyRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BatchSimulation } from "@/components/marketing/landing/BatchSimulation";
import { InspectionSheet } from "@/components/marketing/landing/InspectionSheet";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { ScoreGauge } from "@/components/validator/ScoreGauge";
import { cn } from "@/lib/cn";
import { SCORE_BANDS } from "@/lib/score";

const specs = [
  { value: "0–100", label: "Weighted verdict" },
  { value: "11", label: "Checks per address" },
  { value: "100k", label: "Rows per batch" },
  { value: "4", label: "Export formats" },
];

const checks = [
  {
    name: "Syntax",
    detail: "Local part, domain, and TLD are structurally valid.",
  },
  {
    name: "MX record",
    detail: "The domain publishes a mail exchanger.",
  },
  {
    name: "SMTP mailbox",
    detail: "The mail server responds to a recipient probe when the provider allows it.",
  },
  {
    name: "Catch-all",
    detail: "Domains that accept every address are flagged.",
  },
  {
    name: "Disposable",
    detail: "Burner and temporary inbox providers are flagged.",
  },
  {
    name: "Generic inbox",
    detail: "Role addresses such as info@ and sales@ are surfaced.",
  },
  {
    name: "Free provider",
    detail: "Consumer mailbox providers are identified.",
  },
  {
    name: "DNS blocklist",
    detail: "The domain is checked against DNS blocklists.",
  },
  {
    name: "SPF",
    detail: "The domain publishes an SPF record.",
  },
  {
    name: "DMARC",
    detail: "The domain publishes a DMARC policy.",
  },
  {
    name: "Typo",
    detail: "Near-miss domains are caught before they enter the list.",
  },
];

const steps = [
  {
    kicker: "Station 01",
    title: "Drop the manifest",
    body: "Upload a CSV and we read the email column, deduplicate the list, and show you exactly what will be inspected.",
  },
  {
    kicker: "Station 02",
    title: "The line runs",
    body: "Background workers inspect every row. Progress survives a refresh, and a notification lands when the batch is sorted.",
  },
  {
    kicker: "Station 03",
    title: "Take the sorted list",
    body: "Download clean CSV, JSON, XLSX, or a PDF inspection report. Keep the scores, statuses, and reasons attached.",
  },
];

const plans = [
  {
    name: "Free",
    price: "€0",
    period: "forever",
    inspections: "100 included",
    bulk: "—",
    exports: "—",
    api: "—",
    webhooks: "—",
    support: "Community",
    cta: "Start free",
    href: "/login",
  },
  {
    name: "Starter",
    price: "€9",
    period: "per month",
    inspections: "5,000 / month",
    bulk: "10k rows",
    exports: "CSV, JSON",
    api: "Included",
    webhooks: "—",
    support: "Email",
    cta: "Start trial",
    href: "/pricing",
    featured: true,
  },
  {
    name: "Pro",
    price: "€29",
    period: "per month",
    inspections: "50,000 / month",
    bulk: "100k rows",
    exports: "CSV, JSON, XLSX, PDF",
    api: "Included",
    webhooks: "Included",
    support: "Email",
    cta: "Start trial",
    href: "/pricing",
  },
  {
    name: "Business",
    price: "€99",
    period: "per month",
    inspections: "Unlimited credits",
    bulk: "100k rows",
    exports: "All formats",
    api: "Included",
    webhooks: "Included",
    support: "Email",
    cta: "Start trial",
    href: "/pricing",
  },
] as const;

function SectionLabel({ index, children }: { index: string; children: ReactNode }) {
  return (
    <p className="label-mono flex items-center gap-2.5">
      <span className="text-[var(--accent-text)]">{index}</span>
      <span className="h-px w-5 bg-[var(--line-strong)]" aria-hidden="true" />
      {children}
    </p>
  );
}

export function LandingPage() {
  return (
    <>
      <section className="border-b border-[var(--line)]">
        <div className="mx-auto grid max-w-[1280px] gap-12 px-5 pb-14 pt-12 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-16 lg:px-8 lg:pb-20 lg:pt-20">
          <div>
            <p className="label-mono flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 bg-[var(--accent)]" aria-hidden="true" />
              Email inspection / 0–100
            </p>

            <h1 className="mt-5 max-w-[12ch] font-display text-[clamp(2.9rem,6.1vw,5.6rem)] font-semibold leading-[0.94] tracking-[-0.045em] text-[var(--ink)]">
              Every address gets a{" "}
              <em className="font-normal italic text-[var(--accent-text)]">verdict</em>.
            </h1>

            <p className="mt-6 max-w-[47ch] text-[17px] leading-relaxed text-[var(--ink-2)]">
              MailGuard inspects syntax, MX records, SMTP responses, catch-all domains,
              disposability, role addresses, DNS blocklists, SPF, DMARC, and typos — then returns
              one weighted score from 0 to 100. Clean the list before it costs you a send.
            </p>

            <div className="mt-8 flex flex-wrap gap-2.5">
              <a href="#inspect" className="btn btn-primary btn-lg">
                Inspect an address
                <ArrowDown size={15} aria-hidden="true" />
              </a>
              <Link href="/docs#single-validation" className="btn btn-ghost btn-lg">
                Read the API
                <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            </div>

            <p className="mt-4 font-mono text-[10px] uppercase leading-relaxed tracking-[0.06em] text-[var(--ink-3)]">
              Free plan · 100 inspections included · no card
            </p>
          </div>

          <div className="lg:pl-2">
            <InspectionSheet />
            <p className="mt-3 text-right font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Specimen 0042 / illustrative result
            </p>
          </div>
        </div>
      </section>

      <section
        aria-label="Product specifications"
        className="border-b border-[var(--line)] bg-[var(--surface)]"
      >
        <div className="mx-auto grid max-w-[1280px] grid-cols-2 px-5 lg:grid-cols-4 lg:px-8">
          {specs.map((spec, index) => (
            <div
              key={spec.label}
              className={cn(
                "py-5",
                index % 2 === 1 && "border-l border-[var(--line)] pl-5",
                index >= 2 && "border-t border-[var(--line)] lg:border-t-0",
                index > 0 && "lg:border-l lg:border-[var(--line)] lg:pl-6",
              )}
            >
              <p className="font-display text-2xl font-semibold leading-none tracking-[-0.03em] text-[var(--ink)]">
                {spec.value}
              </p>
              <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
                {spec.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="anatomy" className="scroll-mt-20 border-b border-[var(--line)] py-16 lg:py-24">
        <div className="mx-auto max-w-[1280px] px-5 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.94fr_1.06fr] lg:gap-16">
            <div>
              <SectionLabel index="01">The score</SectionLabel>
              <h2 className="mt-4 max-w-[13ch] font-display text-[clamp(2.2rem,4.3vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.035em]">
                A score you can defend.
              </h2>
              <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
                One number, eleven checks. The verdict is a weighted reading of the evidence — not a
                vibe. Every inspection can be opened, explained, and exported.
              </p>

              <div className="mt-8 border border-[var(--line-strong)] bg-[var(--surface)] p-5 sm:p-6">
                <ScoreGauge score={87} label="Example verdict" showBand showScale />
                <div className="mt-5 grid grid-cols-5 gap-[2px]" aria-hidden="true">
                  {SCORE_BANDS.map((band) => (
                    <div key={band.short}>
                      <span className="block h-1" style={{ backgroundColor: band.color }} />
                      <p className="mt-1.5 font-mono text-[8px] uppercase leading-tight tracking-[0.03em] text-[var(--ink-3)]">
                        {band.short}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 border-t border-[var(--line)] pt-3 text-[11px] leading-relaxed text-[var(--ink-3)]">
                  Green is reserved for clear-to-send. Amber asks for a decision. Red asks you to
                  remove the address.
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-end justify-between gap-4 border-b border-[var(--line-strong)] pb-2">
                <p className="label-mono">The eleven checks</p>
                <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
                  Verdict / evidence
                </p>
              </div>

              <ol>
                {checks.map((check, index) => (
                  <li
                    key={check.name}
                    className="grid grid-cols-[26px_1fr_auto] items-center gap-3 border-b border-[var(--line)] py-4"
                  >
                    <span className="font-mono text-[10px] text-[var(--ink-3)]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--ink)]">{check.name}</h3>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--ink-2)]">
                        {check.detail}
                      </p>
                    </div>
                    <span className="stamp stamp-pass">Pass</span>
                  </li>
                ))}
              </ol>

              <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
                <Check
                  size={13}
                  className="mt-0.5 shrink-0 text-[var(--status-valid)]"
                  aria-hidden="true"
                />
                The sample passes all eleven. Real inspections return the same evidence, including
                the check that failed and the reason.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        id="workflow"
        className="scroll-mt-20 border-b border-[var(--line)] bg-[var(--surface)] py-16 lg:py-24"
      >
        <div className="mx-auto max-w-[1280px] px-5 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end lg:gap-16">
            <div>
              <SectionLabel index="02">The line</SectionLabel>
              <h2 className="mt-4 max-w-[13ch] font-display text-[clamp(2.2rem,4.3vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.035em]">
                From manifest to clean list.
              </h2>
              <p className="mt-4 max-w-[44ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
                A sorter, not a spinner. Drop a list, let the line run, and take the sorted file
                with every score and reason attached.
              </p>
              <Link
                href="/bulk"
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[var(--ink)] underline decoration-[var(--line-strong)] underline-offset-4 transition-colors hover:text-[var(--accent-text)]"
              >
                Open the bulk line
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>

            <div className="border border-[var(--line-strong)] bg-[var(--bg)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
                <p className="font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--ink-3)]">
                  Batch / 2026-10-20-04
                </p>
                <span className="stamp stamp-pass">Complete</span>
              </div>
              <div className="p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-[var(--ink)]">northwind-oct.csv</p>
                    <p className="mt-0.5 font-mono text-[10px] text-[var(--ink-3)]">
                      24,810 rows · 11 checks each
                    </p>
                  </div>
                  <p className="font-mono text-xs text-[var(--ink-2)]">100%</p>
                </div>
                <div className="mt-4 h-2 w-full bg-[var(--surface-3)]" aria-hidden="true">
                  <div className="h-full w-full bg-[var(--accent)]" />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-px border-y border-[var(--line)] bg-[var(--line)]">
                  <div className="bg-[var(--bg)] px-2 py-3">
                    <p className="label-mono text-[8px]">Valid</p>
                    <p className="mt-1 font-mono text-lg leading-none text-[var(--status-valid-text)]">
                      23,902
                    </p>
                  </div>
                  <div className="bg-[var(--bg)] px-2 py-3">
                    <p className="label-mono text-[8px]">Risky</p>
                    <p className="mt-1 font-mono text-lg leading-none text-[var(--status-risky-text)]">
                      618
                    </p>
                  </div>
                  <div className="bg-[var(--bg)] px-2 py-3">
                    <p className="label-mono text-[8px]">Invalid</p>
                    <p className="mt-1 font-mono text-lg leading-none text-[var(--status-invalid-text)]">
                      290
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  <span className="label-mono mr-1 text-[8px]">Export</span>
                  {["CSV", "JSON", "XLSX", "PDF"].map((format) => (
                    <span
                      key={format}
                      className="border border-[var(--line)] px-2 py-1 font-mono text-[9px] text-[var(--ink-2)]"
                    >
                      {format}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 grid border-t border-[var(--line)] lg:grid-cols-3">
            {steps.map((step, index) => (
              <div
                key={step.title}
                className={cn(
                  "border-b border-[var(--line)] py-6 lg:border-b-0",
                  index > 0 && "lg:border-l lg:border-[var(--line)] lg:pl-6",
                  index < steps.length - 1 && "lg:pr-6",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center border border-[var(--ink)] font-mono text-[10px] text-[var(--ink)]">
                    {index + 1}
                  </span>
                  <span className="label-mono">{step.kicker}</span>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-[var(--ink)]">{step.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-2)]">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="api"
        className="scroll-mt-20 border-b border-[var(--code-line)] bg-[var(--code-bg)] py-16 text-[var(--code-ink)] lg:py-24"
      >
        <div className="mx-auto max-w-[1280px] px-5 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
            <div>
              <p className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--code-muted)]">
                <span className="text-[var(--code-accent)]">03</span>
                <span className="h-px w-5 bg-[var(--code-line)]" aria-hidden="true" />
                The interface
              </p>
              <h2 className="mt-4 max-w-[12ch] font-display text-[clamp(2.2rem,4.3vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-[var(--code-ink)]">
                One endpoint. A verdict in the response.
              </h2>
              <p className="mt-4 max-w-[44ch] text-[15px] leading-relaxed text-[var(--code-muted)]">
                Send an address, receive the score, status, eleven checks, and any typo suggestion.
                No proprietary client, no dashboard required.
              </p>

              <dl className="mt-8 divide-y divide-[var(--code-line)] border-y border-[var(--code-line)]">
                {[
                  ["score", "Integer from 0 to 100."],
                  ["status", "valid · risky · invalid · unknown."],
                  ["checks", "The eleven signals behind the number."],
                  ["suggestion", "A corrected address when a typo is caught."],
                ].map(([term, description]) => (
                  <div key={term} className="grid grid-cols-[90px_1fr] gap-3 py-3">
                    <dt className="font-mono text-[11px] text-[var(--code-accent)]">{term}</dt>
                    <dd className="text-[12px] leading-relaxed text-[var(--code-muted)]">
                      {description}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="mt-7 flex flex-wrap gap-2.5">
                <Link
                  href="/docs#single-validation"
                  className="inline-flex h-10 items-center gap-2 border border-[var(--code-line)] px-4 text-[13px] font-medium text-[var(--code-ink)] transition-colors hover:border-[var(--code-muted)] hover:bg-[var(--code-surface)]"
                >
                  API reference
                  <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-10 items-center gap-2 bg-[var(--code-accent)] px-4 text-[13px] font-semibold text-[var(--code-bg)] transition-colors hover:bg-[var(--accent-hover)]"
                >
                  <KeyRound size={14} aria-hidden="true" />
                  Get a key
                </Link>
              </div>
            </div>

            <div className="min-w-0">
              <div className="border border-[var(--code-line)] bg-[var(--code-surface)]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--code-line)] px-4 py-2.5">
                  <p className="font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--code-muted)]">
                    Request
                  </p>
                  <p className="font-mono text-[9px] text-[var(--code-muted)]">query params</p>
                </div>
                <pre className="overflow-x-auto p-4 font-mono text-[11px] leading-[1.75] text-[var(--code-ink)] sm:text-[12px]">
                  <code>{`GET /api/v1/validate?email=mara%40northwind.co
X-API-Key: mg_live_…`}</code>
                </pre>
              </div>

              <div className="mt-3 border border-[var(--code-line)] bg-[var(--code-surface)]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--code-line)] px-4 py-2.5">
                  <p className="font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--code-muted)]">
                    Response
                  </p>
                  <span className="stamp border-[var(--code-accent)] bg-transparent text-[var(--code-accent)]">
                    200 OK
                  </span>
                </div>
                <pre className="overflow-x-auto p-4 font-mono text-[11px] leading-[1.75] text-[var(--code-ink)] sm:text-[12px]">
                  <code>{`{
  "success": true,
  "data": {
    "email": "mara@northwind.co",
    "score": 94,
    "status": "valid",
    "checks": {
      "format": { "passed": true },
      "mx": { "passed": true },
      "smtp": { "passed": true },
      "catchAll": { "passed": true },
      "disposable": { "passed": true },
      "generic": { "passed": true },
      "freeProvider": { "passed": true },
      "dnsbl": { "passed": true },
      "spf": { "passed": true },
      "dmarc": { "passed": true },
      "typo": { "passed": true }
    },
    "processingTimeMs": 184
  },
  "meta": { "creditsUsed": 1, "creditsRemaining": 4986 }
}`}</code>
                </pre>
              </div>
              <p className="mt-2 text-right font-mono text-[9px] uppercase tracking-[0.07em] text-[var(--code-muted)]">
                Sample response
              </p>
            </div>
          </div>
        </div>
      </section>

      <BatchSimulation />

      <section id="pricing" className="scroll-mt-20 border-b border-[var(--line)] py-16 lg:py-24">
        <div className="mx-auto max-w-[1280px] px-5 lg:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <SectionLabel index="04">The rate card</SectionLabel>
              <h2 className="mt-4 max-w-[15ch] font-display text-[clamp(2.2rem,4.3vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.035em]">
                Priced by the address.
              </h2>
            </div>
            <p className="max-w-[42ch] text-[14px] leading-relaxed text-[var(--ink-2)] lg:text-right">
              Start with 100 free inspections. Move up when the list does. Annual billing is
              available on every paid plan.
            </p>
          </div>

          <div className="mt-9 overflow-x-auto border border-[var(--line-strong)] bg-[var(--surface)]">
            <table className="data-table min-w-[780px]">
              <caption className="sr-only">MailGuard Pro plans and included features</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-[150px] align-bottom">
                    Plan
                  </th>
                  {plans.map((plan) => (
                    <th key={plan.name} scope="col" className="align-top">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-sm font-semibold normal-case tracking-normal text-[var(--ink)]">
                          {plan.name}
                        </span>
                        {"featured" in plan && plan.featured && (
                          <span className="stamp stamp-warn">Most chosen</span>
                        )}
                      </div>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="font-display text-2xl font-semibold normal-case tracking-[-0.03em] text-[var(--ink)]">
                          {plan.price}
                        </span>
                        <span className="font-mono text-[9px] normal-case tracking-normal text-[var(--ink-3)]">
                          {plan.period}
                        </span>
                      </div>
                      <Link
                        href={plan.href}
                        className={cn(
                          "mt-3 inline-flex h-8 items-center justify-center rounded-[var(--radius-sm)] border px-3 text-[11px] font-medium normal-case tracking-normal transition-colors",
                          "featured" in plan && plan.featured
                            ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)] hover:bg-[var(--ink-2)]"
                            : "border-[var(--line)] text-[var(--ink)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]",
                        )}
                      >
                        {plan.cta}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Inspections", "inspections"],
                  ["Bulk CSV", "bulk"],
                  ["Exports", "exports"],
                  ["API access", "api"],
                  ["Webhooks", "webhooks"],
                  ["Support", "support"],
                ].map(([label, key]) => (
                  <tr key={label}>
                    <th scope="row" className="text-[10px] tracking-[0.05em]">
                      {label}
                    </th>
                    {plans.map((plan) => (
                      <td key={plan.name} className="text-[12px] text-[var(--ink-2)]">
                        {plan[key as keyof typeof plan]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--ink-3)] sm:hidden">
            Scroll sideways to compare all plans
          </p>

          <div className="mt-4 flex flex-col gap-2 text-[11px] text-[var(--ink-3)] sm:flex-row sm:items-center sm:justify-between">
            <p>Prices in EUR, excluding VAT. Annual billing available on paid plans.</p>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1.5 font-medium text-[var(--ink)] underline decoration-[var(--line-strong)] underline-offset-4 hover:text-[var(--accent-text)]"
            >
              Full pricing and FAQ
              <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)]">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-8 px-5 py-14 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:py-20">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--accent-ink)] opacity-70">
              The next send
            </p>
            <h2 className="mt-3 max-w-[16ch] font-display text-[clamp(2rem,4.5vw,3.6rem)] font-semibold leading-[1.02] tracking-[-0.035em]">
              Send to the addresses that answer.
            </h2>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link
              href="/login"
              className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--ink)] px-5 text-[13px] font-medium text-[var(--bg)] transition-colors hover:bg-[var(--ink-2)]"
            >
              Start free
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Link
              href="/docs"
              className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--accent-ink)] px-5 text-[13px] font-medium text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent-hover)]"
            >
              Read the docs
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </>
  );
}
