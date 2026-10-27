"use client";

import {
  ArrowUpCircle,
  BarChart3,
  Check,
  CreditCard,
  type LucideIcon,
  Shield,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui";
import { Tooltip } from "@/components/ui/Tooltip";
import { logger } from "@/lib/logger";

// --- Types ---

interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  plan: string;
  credits: number;
  createdAt: string;
}

interface UsageData {
  plan: string;
  credits: {
    remaining: number;
    thisMonth: number;
    included: number;
  };
  bulk: { totalEmails: number; totalProcessed: number; maxBatch: number };
  apiKeys: number;
  webhooks: number;
  memberSince: string;
}

interface PlanDef {
  name: string;
  label: string;
  monthlyPrice: string;
  credits: string;
  description: string;
  features: string[];
  icon: LucideIcon;
}

// --- Plan definitions (mirrors marketing/pricing) ---

const PLANS: PlanDef[] = [
  {
    name: "FREE",
    label: "Free",
    monthlyPrice: "€0",
    credits: "100",
    description: "Perfect for testing",
    features: [
      "100 validations included",
      "Single email validation",
      "Basic score (0-100)",
      "Email format check",
    ],
    icon: Shield,
  },
  {
    name: "STARTER",
    label: "Starter",
    monthlyPrice: "€9",
    credits: "5,000",
    description: "For small teams",
    features: [
      "5,000 validations/month",
      "Bulk CSV upload (10k rows)",
      "CSV & JSON export",
      "API access",
      "Email support",
    ],
    icon: Zap,
  },
  {
    name: "PRO",
    label: "Pro",
    monthlyPrice: "€29",
    credits: "50,000",
    description: "For growing businesses",
    features: [
      "50,000 validations/month",
      "Bulk CSV upload (100k rows)",
      "All export formats (XLSX, PDF)",
      "Webhooks",
      "Email support",
      "Advanced filters",
    ],
    icon: BarChart3,
  },
  {
    name: "BUSINESS",
    label: "Business",
    monthlyPrice: "€99",
    credits: "Unlimited",
    description: "For enterprises",
    features: [
      "Unlimited validation credits",
      "Bulk CSV upload (100k rows)",
      "All export formats (XLSX, PDF)",
      "Webhooks and API access",
      "Advanced filters",
      "Higher rate limits",
    ],
    icon: ArrowUpCircle,
  },
];

// --- Component ---

export default function BillingPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, usageRes] = await Promise.all([
        fetch("/api/v1/user/profile"),
        fetch("/api/v1/usage"),
      ]);

      if (!profileRes.ok || !usageRes.ok) {
        throw new Error("Failed to fetch billing data");
      }

      const profileData = await profileRes.json();
      const usageData = await usageRes.json();

      if (profileData.data) setUser(profileData.data);
      if (usageData.data) setUsage(usageData.data);
    } catch (err) {
      logger.error({ err }, "Failed to fetch billing data");
      setError("Could not load billing information. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Auto-dismiss success messages after 4 seconds
  useEffect(() => {
    if (message?.type !== "success") return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  const openStripePortal = useCallback(async () => {
    setPortalLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/billing/portal", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        }
      } else {
        const data = await res.json();
        setMessage({
          type: "error",
          text: data.error || "Could not open billing portal. Please try again.",
        });
      }
    } catch (err) {
      logger.error({ err }, "Failed to open billing portal");
      setMessage({
        type: "error",
        text: "Could not open billing portal. Please try again.",
      });
    } finally {
      setPortalLoading(false);
    }
  }, []);

  const currentPlan = user?.plan || "FREE";
  const currentPlanDef = PLANS.find((p) => p.name === currentPlan) || PLANS[0];

  const startCheckout = useCallback(async (planName: string) => {
    setCheckoutPlan(planName);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planName }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.data?.url) {
        window.location.href = data.data.url;
        return;
      }
      setMessage({
        type: "error",
        text: data.error || "Could not start checkout. Please try again.",
      });
    } catch (err) {
      logger.error({ err }, "Failed to start checkout");
      setMessage({
        type: "error",
        text: "Could not start checkout. Please try again.",
      });
    } finally {
      setCheckoutPlan(null);
    }
  }, []);

  /**
   * Paid plan from FREE → Stripe Checkout (new subscription).
   * Everything else (downgrade, plan change with an active subscription) →
   * customer portal, where Stripe handles proration/cancellation.
   */
  const handlePlanAction = useCallback(
    (planName: string) => {
      if (planName !== "FREE" && currentPlan === "FREE") {
        void startCheckout(planName);
      } else {
        void openStripePortal();
      }
    },
    [currentPlan, startCheckout, openStripePortal],
  );

  const usagePercentage =
    usage && usage.credits.included > 0
      ? Math.min(Math.round((usage.credits.thisMonth / usage.credits.included) * 100), 100)
      : null;

  // --- Loading state ---
  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            eyebrow="Account / billing"
            title="Billing, on the record."
            description="Plan, usage, and payment details in one register."
          />
          <div className="grid gap-px border border-[var(--line-strong)] bg-[var(--line)] lg:grid-cols-[1.4fr_0.6fr]">
            <div className="space-y-4 bg-[var(--surface)] p-5">
              <div className="h-2.5 w-24 animate-skeleton" />
              <div className="h-8 w-40 animate-skeleton" />
              <div className="h-3 w-full animate-skeleton" />
              <div className="h-3 w-2/3 animate-skeleton" />
            </div>
            <div className="space-y-4 bg-[var(--surface)] p-5">
              <div className="h-2.5 w-20 animate-skeleton" />
              <div className="h-8 w-24 animate-skeleton" />
              <div className="h-2 w-full animate-skeleton" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Error state ---
  if (error) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            eyebrow="Account / billing"
            title="Billing, on the record."
            description="Plan, usage, and payment details in one register."
          />
          <div className="border border-[var(--line-strong)] bg-[var(--surface)] px-6 py-14 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-3)]">
              <CreditCard size={17} aria-hidden="true" />
            </span>
            <p className="mt-4 text-sm text-[var(--ink-2)]">{error}</p>
            <Button onClick={() => void fetchData()} variant="primary" size="md" className="mt-5">
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // --- Empty state (no user data) ---
  if (!user) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            eyebrow="Account / billing"
            title="Billing, on the record."
            description="Plan, usage, and payment details in one register."
          />
          <div className="border border-[var(--line-strong)] bg-[var(--surface)] px-6 py-14 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-3)]">
              <CreditCard size={17} aria-hidden="true" />
            </span>
            <p className="mt-4 text-sm text-[var(--ink-3)]">No billing information available.</p>
          </div>
        </div>
      </div>
    );
  }

  // --- Main content ---
  const PlanIcon = currentPlanDef.icon;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          eyebrow="Account / billing"
          title="Billing, on the record."
          description="The plan you are on, what it has consumed, and the route to change it. No hidden line items."
          actions={
            <Button
              onClick={() => void openStripePortal()}
              disabled={portalLoading}
              variant="primary"
              size="sm"
            >
              {portalLoading ? "Opening…" : "Manage in Stripe"}
            </Button>
          }
          meta={
            <>
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                Plan / {currentPlanDef.label}
              </span>
              <span className="h-3 w-px bg-[var(--line)]" aria-hidden="true" />
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                {currentPlanDef.monthlyPrice} / month
              </span>
              <span className="h-3 w-px bg-[var(--line)]" aria-hidden="true" />
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                Member since{" "}
                {new Date(user.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </>
          }
        />

        {message && (
          <div
            role="alert"
            className={
              message.type === "success"
                ? "mb-5 flex items-center gap-2 border border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-3 text-[13px] text-[var(--ink-2)]"
                : "mb-5 flex items-center gap-2 border border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] px-4 py-3 text-[13px] text-[var(--status-invalid-text)]"
            }
          >
            {message.text}
          </div>
        )}

        <div className="grid gap-px border border-[var(--line-strong)] bg-[var(--line)] lg:grid-cols-[1.4fr_0.6fr]">
          <section className="bg-[var(--surface)] p-5">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] pb-3">
              <div>
                <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                  Current Plan
                </h2>
                <p className="mt-0.5 text-[12px] text-[var(--ink-3)]">
                  You are on the {currentPlanDef.label} plan
                </p>
              </div>
              <span className="stamp stamp-idle">{currentPlan}</span>
            </div>

            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center border border-[var(--line)] bg-[var(--accent-soft)] text-[var(--accent-text)]">
                  <PlanIcon size={17} aria-hidden="true" />
                </span>
                <span className="font-display text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                  {currentPlanDef.label}
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                  {currentPlanDef.monthlyPrice}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
                  / month
                </span>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-px border border-[var(--line)] bg-[var(--line)]">
              <div className="bg-[var(--surface)] px-3 py-2.5">
                <dt className="label-mono text-[8px]">Credits remaining</dt>
                <dd className="mt-1 font-mono text-[15px] font-semibold text-[var(--ink)] tabular">
                  {user.plan === "BUSINESS" ? "Unlimited" : user.credits.toLocaleString()}
                </dd>
              </div>
              <div className="bg-[var(--surface)] px-3 py-2.5">
                <dt className="label-mono text-[8px]">Monthly allowance</dt>
                <dd className="mt-1 font-mono text-[15px] font-semibold text-[var(--ink)]">
                  {currentPlanDef.credits}
                </dd>
              </div>
            </dl>

            <p className="label-mono mt-5">Plan Features</p>
            <ul className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {currentPlanDef.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-[12px] leading-snug">
                  <Check
                    className="mt-0.5 shrink-0 text-[var(--ink-3)]"
                    size={12}
                    aria-hidden="true"
                  />
                  <span className="text-[var(--ink-2)]">{feature}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-[var(--surface)] p-5">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                Monthly Usage
              </h2>
              <span className="label-mono">Cycle</span>
            </div>

            {usage ? (
              <>
                {usage.credits.included === -1 ? (
                  <div className="py-6 text-center">
                    <p className="font-display text-5xl font-semibold leading-none tracking-[-0.05em] text-[var(--ink)]">
                      ∞
                    </p>
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                      Unlimited validations
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mt-4 flex items-baseline gap-1.5">
                      <span className="font-display text-4xl font-semibold leading-none tracking-[-0.04em] text-[var(--ink)] tabular">
                        {usage.credits.thisMonth.toLocaleString()}
                      </span>
                      <span className="font-mono text-[11px] text-[var(--ink-3)]">
                        / {usage.credits.included.toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                      validations this month
                    </p>

                    <Tooltip content={`${usagePercentage}% of monthly credits used`} side="top">
                      <div className="mt-4 h-2 w-full cursor-help bg-[var(--surface-3)]">
                        <div
                          className={`h-full transition-all duration-500 ${
                            usagePercentage !== null && usagePercentage >= 90
                              ? "bg-[var(--status-invalid)]"
                              : usagePercentage !== null && usagePercentage >= 70
                                ? "bg-[var(--status-risky)]"
                                : "bg-[var(--accent)]"
                          }`}
                          style={{ width: `${usagePercentage ?? 0}%` }}
                        />
                      </div>
                    </Tooltip>

                    <dl className="mt-5 space-y-2 border-t border-[var(--line)] pt-3">
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-[11px] text-[var(--ink-3)]">Remaining</dt>
                        <dd className="font-mono text-[11px] text-[var(--ink)] tabular">
                          {usage.credits.remaining.toLocaleString()}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-[11px] text-[var(--ink-3)]">Bulk processed</dt>
                        <dd className="font-mono text-[11px] text-[var(--ink)] tabular">
                          {usage.bulk.totalProcessed.toLocaleString()}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-[11px] text-[var(--ink-3)]">API keys / webhooks</dt>
                        <dd className="font-mono text-[11px] text-[var(--ink)] tabular">
                          {usage.apiKeys} / {usage.webhooks}
                        </dd>
                      </div>
                    </dl>
                  </>
                )}
              </>
            ) : (
              <p className="py-6 text-center text-sm text-[var(--ink-3)]">Usage data unavailable</p>
            )}
          </section>
        </div>

        <section className="mt-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="label-mono flex items-center gap-2">
                <span className="h-1.5 w-1.5 bg-[var(--accent)]" aria-hidden="true" />
                Rate card
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                Compare Plans
              </h2>
            </div>
            <p className="max-w-[42ch] text-[12px] leading-relaxed text-[var(--ink-3)]">
              Change any time. Upgrades apply immediately; downgrades start with the next cycle.
            </p>
          </div>

          <div className="grid gap-px border border-[var(--line-strong)] bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-4">
            {PLANS.map((plan) => {
              const isCurrentPlan = plan.name === currentPlan;
              const Icon = plan.icon;

              return (
                <article
                  key={plan.name}
                  aria-current={isCurrentPlan ? true : undefined}
                  className={`relative flex flex-col bg-[var(--surface)] p-5 ${
                    isCurrentPlan
                      ? "outline outline-1 -outline-offset-1 outline-[var(--accent)]"
                      : ""
                  }`}
                >
                  {isCurrentPlan && (
                    <span className="absolute -top-2 left-4 bg-[var(--accent)] px-2 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.08em] text-white">
                      Current
                    </span>
                  )}

                  <div className="flex items-center gap-2">
                    <Icon
                      size={15}
                      className={
                        isCurrentPlan ? "text-[var(--accent-text)]" : "text-[var(--ink-3)]"
                      }
                      aria-hidden="true"
                    />
                    <h3 className="font-display text-base font-semibold tracking-[-0.02em] text-[var(--ink)]">
                      {plan.label}
                    </h3>
                  </div>

                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="font-mono text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                      {plan.monthlyPrice}
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
                      /mo
                    </span>
                  </div>

                  <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-2)]">
                    {plan.credits} credits/mo
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--ink-3)]">{plan.description}</p>

                  <ul className="mt-4 flex-1 space-y-1.5 border-t border-[var(--line)] pt-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-[11px] leading-snug">
                        <Check
                          className={
                            isCurrentPlan
                              ? "mt-0.5 shrink-0 text-[var(--accent-text)]"
                              : "mt-0.5 shrink-0 text-[var(--ink-3)]"
                          }
                          size={11}
                          aria-hidden="true"
                        />
                        <span
                          className={isCurrentPlan ? "text-[var(--ink)]" : "text-[var(--ink-2)]"}
                        >
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {isCurrentPlan ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-5 w-full cursor-default"
                      disabled
                    >
                      Current Plan
                    </Button>
                  ) : (
                    <Button
                      variant={plan.name === "PRO" ? "accent" : "primary"}
                      size="sm"
                      className="mt-5 w-full"
                      disabled={portalLoading || checkoutPlan !== null}
                      onClick={() => handlePlanAction(plan.name)}
                    >
                      {checkoutPlan === plan.name
                        ? "Redirecting..."
                        : plan.monthlyPrice === "€0"
                          ? "Downgrade"
                          : "Upgrade"}
                    </Button>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-5 border border-[var(--line-strong)] bg-[var(--surface)]">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
              Billing Management
            </h2>
          </div>

          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-2)]">
                <CreditCard size={15} aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium text-[var(--ink)]">Payment Method</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--ink-3)]">
                  Manage your payment method, invoices, or cancellation in Stripe.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                onClick={() => void openStripePortal()}
                disabled={portalLoading}
                variant="ghost"
                size="sm"
              >
                {portalLoading ? "Opening..." : "Update"}
              </Button>
              <Button
                onClick={() => void openStripePortal()}
                disabled={portalLoading}
                variant="primary"
                size="sm"
              >
                {portalLoading ? "Opening..." : "Manage in Stripe"}
              </Button>
            </div>
          </div>

          <p className="border-t border-[var(--line)] px-4 py-3 text-[11px] leading-relaxed text-[var(--ink-3)]">
            The Stripe customer portal is the source of truth for payment methods, invoices, plan
            changes, and cancellation. Prices exclude VAT.
          </p>
        </section>
      </div>
    </div>
  );
}
