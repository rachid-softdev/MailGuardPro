"use client";

import { useState } from "react";

const plans = [
  {
    name: "Free",
    monthlyPrice: "€0",
    annualPrice: "€0",
    period: "/month",
    credits: "100",
    description: "Perfect for testing",
    features: [
      "100 validations/month",
      "Single email validation",
      "Basic score (0-100)",
      "Email format check",
    ],
    cta: "Get started",
    popular: false,
  },
  {
    name: "Starter",
    monthlyPrice: "€9",
    annualPrice: "€7",
    period: "/month",
    credits: "5,000",
    description: "For small teams",
    features: [
      "5,000 validations/month",
      "Bulk CSV upload (10k rows)",
      "CSV & JSON export",
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
    period: "/month",
    credits: "50,000",
    description: "For growing businesses",
    features: [
      "50,000 validations/month",
      "Bulk CSV upload (100k rows)",
      "All export formats (XLSX, PDF)",
      "Webhooks",
      "Priority support",
      "Advanced filters",
    ],
    cta: "Start trial",
    popular: false,
  },
  {
    name: "Business",
    monthlyPrice: "€99",
    annualPrice: "€79",
    period: "/month",
    credits: "Unlimited",
    description: "For enterprises",
    features: [
      "Unlimited validations",
      "Unlimited bulk size",
      "All features included",
      "Dedicated IP",
      "SLA 99.9%",
      "Phone support",
      "Custom integrations",
    ],
    cta: "Contact us",
    popular: false,
  },
];

const faqs = [
  {
    question: "Can I upgrade or downgrade at any time?",
    answer:
      "Yes, you can change your plan at any time. Upgrades take effect immediately, while downgrades apply at the start of your next billing cycle. There are no penalties or hidden fees.",
  },
  {
    question: "What happens if I exceed my validation limit?",
    answer:
      "You'll receive a notification when you reach 80% of your monthly limit. If you exceed it, validations will be paused until the next cycle or until you upgrade. You can also purchase additional credits at €0.002 per validation.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Yes, all paid plans come with a 14-day free trial. No credit card required. You'll get full access to all features of your chosen plan, and you can cancel anytime during the trial period.",
  },
  {
    question: "Can I pay by invoice?",
    answer:
      "Annual Business plan customers can pay by invoice. We support wire transfers and SEPA payments for annual commitments. Contact our sales team to set up invoice billing for your account.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit and debit cards (Visa, Mastercard, American Express), as well as PayPal. Annual payments can also be made via wire transfer or SEPA direct debit for qualifying Business plans.",
  },
];

function CheckIcon() {
  return (
    <svg
      className="w-4 h-4 shrink-0 text-[var(--accent)]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function BillingToggle({ annual, onChange }: { annual: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="inline-flex items-center bg-[var(--bg-surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-1">
      <button
        onClick={() => onChange(false)}
        className={`px-4 py-2 text-sm font-display font-semibold rounded-[var(--radius-md)] transition-all duration-150 ${
          !annual
            ? "bg-[var(--text-primary)] text-[var(--text-inverted)] shadow-sm"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}
      >
        Monthly
      </button>
      <button
        onClick={() => onChange(true)}
        className={`px-4 py-2 text-sm font-display font-semibold rounded-[var(--radius-md)] transition-all duration-150 ${
          annual
            ? "bg-[var(--text-primary)] text-[var(--text-inverted)] shadow-sm"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}
      >
        Annual
      </button>
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
  answer: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-[var(--border)]">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-5 text-left gap-4"
      >
        <span className="font-display font-semibold text-[var(--text-primary)]">{question}</span>
        <svg
          className={`w-5 h-5 shrink-0 text-[var(--text-secondary)] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          open ? "max-h-60 pb-5" : "max-h-0"
        }`}
      >
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{answer}</p>
      </div>
    </div>
  );
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);

  return (
    <>
      {/* Pricing */}
      <section className="py-20">
        <div className="max-w-[var(--container-xl)] mx-auto px-6">
          {/* Title + Toggle */}
          <div className="text-center mb-12 animate-fade-up">
            <h1 className="text-4xl font-display font-bold mb-3">Simple, transparent pricing</h1>
            <p className="text-[var(--text-secondary)] mb-8">
              Choose the plan that fits your needs. All plans include a 14-day free trial.
            </p>
            <div className="flex justify-center">
              <BillingToggle annual={annual} onChange={setAnnual} />
            </div>
          </div>

          {/* Plan cards */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`card relative flex flex-col ${
                  plan.popular
                    ? "border-2 border-[var(--accent)] shadow-[var(--shadow-lg)] ring-1 ring-[var(--accent)]"
                    : ""
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-[var(--accent)] text-white text-xs font-semibold rounded-full whitespace-nowrap">
                    Popular
                  </div>
                )}

                <h3 className="text-lg font-display font-semibold mb-2">{plan.name}</h3>

                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-mono font-bold">
                    {annual ? plan.annualPrice : plan.monthlyPrice}
                  </span>
                  <span className="text-sm text-[var(--text-muted)]">{plan.period}</span>
                </div>

                {annual && plan.annualPrice !== "€0" && (
                  <div className="mb-2">
                    <span className="inline-block text-xs font-mono font-semibold text-[var(--accent)] bg-[var(--accent-light)] px-2 py-0.5 rounded-full tracking-wide">
                      Save 20%
                    </span>
                  </div>
                )}

                <p className="text-sm text-[var(--text-secondary)] mb-1">
                  {plan.credits} validations/mo
                </p>
                <p className="text-xs text-[var(--text-muted)] mb-6">{plan.description}</p>

                <ul className="space-y-2.5 mb-8 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="text-sm flex items-start gap-2.5">
                      <CheckIcon />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  className={`btn w-full btn-md ${plan.popular ? "btn-accent" : "btn-primary"}`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="pb-20">
        <div className="max-w-[var(--container-lg)] mx-auto px-6">
          <h2 className="text-2xl font-display font-bold text-center mb-10">
            Frequently asked questions
          </h2>
          <div className="max-w-2xl mx-auto">
            {faqs.map((faq, index) => (
              <FAQItem
                key={index}
                question={faq.question}
                answer={faq.answer}
                open={openFAQ === index}
                onToggle={() => setOpenFAQ(openFAQ === index ? null : index)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8">
        <div className="max-w-[var(--container-lg)] mx-auto px-6 text-center text-sm text-[var(--text-muted)]">
          <p>Pay as you go: €0.002 per validation • All plans include CSV/JSON export</p>
        </div>
      </footer>
    </>
  );
}
