"use client";

import { Check, ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { cn } from "@/lib/cn";

const plans = [
  {
    name: "Free",
    monthlyPrice: "€0",
    annualPrice: "€0",
    period: "/ month",
    credits: "100",
    description: "For a first look at the line",
    features: [
      "100 validations included",
      "Single email validation",
      "Quality score 0–100",
      "Syntax and domain checks",
    ],
    cta: "Start free",
    popular: false,
  },
  {
    name: "Starter",
    monthlyPrice: "€9",
    annualPrice: "€7",
    period: "/ month",
    credits: "5,000",
    description: "For small teams with a list",
    features: [
      "5,000 validations / month",
      "Bulk CSV upload — 10k rows",
      "CSV and JSON export",
      "API access",
      "Email support",
    ],
    cta: "Start trial",
    popular: true,
  },
  {
    name: "Pro",
    monthlyPrice: "€29",
    annualPrice: "€23",
    period: "/ month",
    credits: "50,000",
    description: "For lists that run weekly",
    features: [
      "50,000 validations / month",
      "Bulk CSV upload — 100k rows",
      "All export formats — XLSX, PDF",
      "Webhooks",
      "Email support",
      "Advanced filters",
    ],
    cta: "Start trial",
    popular: false,
  },
  {
    name: "Business",
    monthlyPrice: "€99",
    annualPrice: "€79",
    period: "/ month",
    credits: "Unlimited",
    description: "For high-volume operations",
    features: [
      "Unlimited validation credits",
      "Bulk CSV upload — 100k rows",
      "All export formats — XLSX, PDF",
      "Webhooks and API access",
      "Advanced filters",
      "Higher rate limits",
    ],
    cta: "Start trial",
    popular: false,
  },
];

const included = [
  ["Every plan", "Score, status, and reasons attached to every row"],
  ["Exports", "CSV and JSON on all paid plans; XLSX and PDF from Pro"],
  ["API", "REST access with keys and scoped permissions"],
  ["No surprise", "Cancel anytime. No setup fee. No annual lock-in."],
];

const faqs: { question: string; answer: ReactNode }[] = [
  {
    question: "Can I upgrade or downgrade at any time?",
    answer:
      "Yes. Upgrades take effect immediately. Downgrades apply at the start of your next billing cycle. There are no penalties or hidden fees.",
  },
  {
    question: "What happens if I exceed my validation limit?",
    answer:
      "You receive a notification at 80% of your monthly limit. If you exceed it, validations pause until the next cycle or until you upgrade. Free accounts include a one-time 100-validation allowance; paid plans refill monthly.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Every paid plan includes a 14-day trial with full access to the features of that plan. You can cancel during the trial; your card is only charged when it ends.",
  },
  {
    question: "Can I pay by invoice?",
    answer: (
      <>
        Invoice billing is not available in the product today. Write to{" "}
        <a
          className="text-[var(--accent-text)] underline decoration-[var(--line-strong)] underline-offset-2"
          href="mailto:support@mailguardpro.com?subject=Annual%20billing%20question"
        >
          support@mailguardpro.com
        </a>{" "}
        if you need to discuss annual billing.
      </>
    ),
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "Card payments are handled by Stripe Checkout. Available payment methods depend on your region and are shown at checkout.",
  },
];

function BillingToggle({ annual, onChange }: { annual: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="inline-flex border border-[var(--line-strong)] bg-[var(--surface)] p-0.5">
      {[
        { label: "Monthly", value: false },
        { label: "Annual", value: true },
      ].map((option) => (
        <button
          key={option.label}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={annual === option.value}
          className={cn(
            "h-8 px-3 font-mono text-[10px] uppercase tracking-[0.06em] transition-colors",
            annual === option.value
              ? "bg-[var(--ink)] text-[var(--bg)]"
              : "text-[var(--ink-3)] hover:text-[var(--ink)]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function FAQItem({
  question,
  answer,
  open,
  onToggle,
}: {
  question: string;
  answer: ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-[var(--line)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-4 text-left"
      >
        <span className="font-display text-sm font-semibold text-[var(--ink)]">{question}</span>
        <ChevronDown
          size={16}
          className={cn(
            "shrink-0 text-[var(--ink-3)] transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="pb-5 pr-8">
          <p className="text-sm leading-relaxed text-[var(--ink-2)]">{answer}</p>
        </div>
      )}
    </div>
  );
}

export function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [openFAQ, setOpenFAQ] = useState<number | null>(0);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [ctaError, setCtaError] = useState<string | null>(null);

  /**
   * Free → dashboard (anonymous visitors are bounced to /login by the proxy).
   * Paid plans → Stripe Checkout; anonymous visitors are bounced to /login
   * first with a callbackUrl back to the billing page.
   */
  const handleCta = async (planName: string) => {
    if (planName === "Free") {
      window.location.href = "/dashboard";
      return;
    }
    setPendingPlan(planName);
    setCtaError(null);
    try {
      const res = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: planName.toUpperCase(),
          interval: annual ? "year" : "month",
        }),
      });
      if (res.status === 401) {
        window.location.href = `/login?callbackUrl=${encodeURIComponent("/billing")}`;
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.data?.url) {
        window.location.href = data.data.url;
        return;
      }
      setCtaError(data.error || "Could not start checkout. Please try again.");
    } catch {
      setCtaError("Could not start checkout. Please try again.");
    } finally {
      setPendingPlan(null);
    }
  };

  return (
    <>
      <section className="border-b border-[var(--line)]">
        <div className="mx-auto max-w-[1280px] px-5 py-12 lg:px-8 lg:py-16">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="label-mono flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 bg-[var(--accent)]" aria-hidden="true" />
                Rate card / four lanes
              </p>
              <h1 className="mt-4 max-w-[13ch] font-display text-[clamp(2.5rem,5vw,4.5rem)] font-semibold leading-[0.96] tracking-[-0.045em] text-[var(--ink)]">
                Simple, honest rates.
              </h1>
              <p className="mt-4 max-w-[54ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
                Pick the volume you need. Every plan returns the same score, the same eleven checks,
                and the same exportable evidence. No feature held hostage for a demo call.
              </p>
            </div>

            <div className="lg:pb-1">
              <p className="label-mono mb-2">Billing interval</p>
              <BillingToggle annual={annual} onChange={setAnnual} />
              <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                {annual ? "Annual / two months free" : "Monthly / cancel anytime"}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--line)] py-10 lg:py-14">
        <div className="mx-auto max-w-[1280px] px-5 lg:px-8">
          <div className="grid gap-px border border-[var(--line-strong)] bg-[var(--line)] md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={cn(
                  "relative flex flex-col bg-[var(--surface)] p-5 lg:p-6",
                  plan.popular && "pt-6",
                )}
              >
                {plan.popular && (
                  <div
                    className="absolute inset-x-0 top-0 h-[2px] bg-[var(--accent)]"
                    aria-hidden="true"
                  />
                )}

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                      {plan.name}
                    </h2>
                    <p className="mt-1 text-[11px] text-[var(--ink-3)]">{plan.description}</p>
                  </div>
                  {plan.popular && <span className="stamp stamp-warn">Popular</span>}
                </div>

                <div className="mt-5 flex items-baseline gap-1.5">
                  <span className="font-mono text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)] tabular">
                    {annual ? plan.annualPrice : plan.monthlyPrice}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
                    {plan.period}
                  </span>
                </div>
                <p className="mt-1 h-4 font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
                  {annual && plan.annualPrice !== "€0"
                    ? "Billed annually / save 20%"
                    : plan.name === "Free"
                      ? "Free forever / no card"
                      : "Billed monthly"}
                </p>

                <div className="mt-5 border-t border-[var(--line)] pt-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--ink-2)]">
                    {plan.credits} inspections / month
                  </p>
                  <ul className="mt-3 space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-[12px] leading-snug">
                        <Check
                          size={12}
                          className="mt-0.5 shrink-0 text-[var(--ink-3)]"
                          aria-hidden="true"
                        />
                        <span className="text-[var(--ink-2)]">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  className={cn(
                    "btn btn-md mt-6 w-full",
                    plan.popular ? "btn-accent" : "btn-primary",
                  )}
                  onClick={() => void handleCta(plan.name)}
                  disabled={pendingPlan !== null}
                  aria-label={`${plan.cta} — ${plan.name} plan`}
                >
                  {pendingPlan === plan.name ? "Redirecting…" : plan.cta}
                </button>
              </article>
            ))}
          </div>

          {ctaError && (
            <p className="mt-4 border border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] px-3 py-2 text-sm text-[var(--status-invalid-text)]">
              {ctaError}
            </p>
          )}

          <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
            Prices in EUR, excluding VAT. Annual billing available on paid plans.
          </p>
        </div>
      </section>

      <section
        aria-label="Included in every plan"
        className="border-b border-[var(--line)] bg-[var(--surface)]"
      >
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-px bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
          {included.map(([title, body]) => (
            <div key={title} className="bg-[var(--surface)] px-5 py-5 lg:px-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--ink)]">
                {title}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-3)]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-14 lg:py-20">
        <div className="mx-auto grid max-w-[1280px] gap-10 px-5 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16 lg:px-8">
          <div>
            <p className="label-mono flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 bg-[var(--accent)]" aria-hidden="true" />
              Questions / rate card
            </p>
            <h2 className="mt-4 max-w-[12ch] font-display text-[clamp(2rem,3.7vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-[var(--ink)]">
              Before you pick a lane.
            </h2>
            <p className="mt-4 max-w-[38ch] text-sm leading-relaxed text-[var(--ink-2)]">
              Billing should be as legible as the inspection result. If something is not answered
              here, ask us directly.
            </p>
            <a
              href="mailto:support@mailguardpro.com"
              className="mt-5 inline-block font-mono text-[11px] text-[var(--accent-text)] underline decoration-[var(--line-strong)] underline-offset-4"
            >
              support@mailguardpro.com
            </a>
          </div>

          <div className="border-t border-[var(--line-strong)]">
            {faqs.map((faq, index) => (
              <FAQItem
                key={faq.question}
                question={faq.question}
                answer={faq.answer}
                open={openFAQ === index}
                onToggle={() => setOpenFAQ(openFAQ === index ? null : index)}
              />
            ))}
          </div>
        </div>
      </section>

      <MarketingFooter />
    </>
  );
}
