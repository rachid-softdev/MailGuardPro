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
      "100 validations/month",
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
      "Priority support",
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
      "Unlimited validations",
      "Unlimited bulk size",
      "All features included",
      "Dedicated IP",
      "SLA 99.9%",
      "Phone support",
      "Custom integrations",
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

  const usagePercentage =
    usage && usage.credits.included > 0
      ? Math.min(Math.round((usage.credits.thisMonth / usage.credits.included) * 100), 100)
      : null;

  // --- Loading state ---
  if (loading) {
    return (
      <div className="p-8 max-w-5xl">
        <div className="mb-8">
          <div className="h-8 w-48 animate-skeleton rounded mb-2" />
          <div className="h-4 w-72 animate-skeleton rounded" />
        </div>
        <div className="card mb-8">
          <div className="space-y-4">
            <div className="h-6 w-32 animate-skeleton rounded" />
            <div className="h-4 w-64 animate-skeleton rounded" />
            <div className="h-2 w-full animate-skeleton rounded" />
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card">
              <div className="h-6 w-24 animate-skeleton rounded mb-4" />
              <div className="space-y-2">
                {[...Array(4)].map((_, j) => (
                  <div key={j} className="h-4 w-full animate-skeleton rounded" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- Error state ---
  if (error) {
    return (
      <div className="p-8 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold mb-2">Billing</h1>
          <p className="text-[var(--text-secondary)]">Manage your subscription and billing</p>
        </div>
        <div className="card">
          <div className="text-center py-8">
            <CreditCard className="mx-auto mb-4 text-[var(--text-muted)]" size={48} />
            <p className="text-[var(--text-muted)] mb-4">{error}</p>
            <button onClick={() => void fetchData()} className="btn btn-primary btn-md">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Empty state (no user data) ---
  if (!user) {
    return (
      <div className="p-8 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold mb-2">Billing</h1>
          <p className="text-[var(--text-secondary)]">Manage your subscription and billing</p>
        </div>
        <div className="card">
          <div className="text-center py-8">
            <CreditCard className="mx-auto mb-4 text-[var(--text-muted)]" size={48} />
            <p className="text-[var(--text-muted)]">No billing information available.</p>
          </div>
        </div>
      </div>
    );
  }

  // --- Main content ---
  const PlanIcon = currentPlanDef.icon;

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold mb-2">Billing</h1>
        <p className="text-[var(--text-secondary)]">Manage your subscription and billing</p>
      </div>

      {/* Alert message */}
      {message && (
        <div
          className={`p-4 rounded-lg mb-6 ${
            message.type === "success"
              ? "bg-[var(--status-valid-bg)] text-[var(--status-valid)]"
              : "bg-[var(--status-invalid-bg)] text-[var(--status-invalid)]"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* === Current Plan + Usage === */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Current Plan Card */}
        <div className="card lg:col-span-2">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center">
                <PlanIcon className="text-[var(--accent)]" size={20} />
              </div>
              <div>
                <h2 className="text-lg font-display font-semibold">Current Plan</h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  You are on the{" "}
                  <span className="font-semibold text-[var(--text-primary)]">
                    {currentPlanDef.label}
                  </span>{" "}
                  plan
                </p>
              </div>
            </div>
            <span className="badge badge-accent">{currentPlan}</span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-1">
                Monthly Price
              </p>
              <p className="text-2xl font-mono font-bold">{currentPlanDef.monthlyPrice}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-1">
                Credits Remaining
              </p>
              <p className="text-2xl font-mono font-bold">{user.credits.toLocaleString()}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">
              Plan Features
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {currentPlanDef.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm">
                  <Check className="shrink-0 text-[var(--accent)]" size={14} />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Usage Card */}
        <div className="card">
          <h2 className="text-lg font-display font-semibold mb-4">Monthly Usage</h2>

          {usage ? (
            <>
              {usage.credits.included === -1 ? (
                /* Unlimited plan */
                <div className="flex flex-col items-center justify-center py-6">
                  <ArrowUpCircle className="text-[var(--accent)] mb-3" size={40} />
                  <p className="text-lg font-display font-bold">Unlimited</p>
                  <p className="text-sm text-[var(--text-muted)]">validations</p>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="text-3xl font-display font-bold">
                      {usage.credits.thisMonth.toLocaleString()}
                    </p>
                    <p className="text-sm text-[var(--text-muted)]">
                      / {usage.credits.included.toLocaleString()}
                    </p>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mb-4">validations this month</p>

                  <Tooltip content={`${usagePercentage}% of monthly credits used`} side="top">
                    <div className="w-full h-2 bg-[var(--bg-subtle)] rounded-full overflow-hidden cursor-help">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          usagePercentage !== null && usagePercentage >= 90
                            ? "bg-[var(--status-invalid)]"
                            : usagePercentage !== null && usagePercentage >= 70
                              ? "bg-yellow-500"
                              : "bg-[var(--accent)]"
                        }`}
                        style={{ width: `${usagePercentage ?? 0}%` }}
                      />
                    </div>
                  </Tooltip>

                  <div className="mt-4 pt-4 border-t border-[var(--border)]">
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-muted)]">Remaining</span>
                      <span className="font-mono font-semibold">
                        {usage.credits.remaining.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="text-center py-6 text-[var(--text-muted)]">
              <p className="text-sm">Usage data unavailable</p>
            </div>
          )}
        </div>
      </div>

      {/* === Plan Comparison === */}
      <div className="mb-8">
        <h2 className="text-lg font-display font-semibold mb-4">Compare Plans</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((plan) => {
            const isCurrentPlan = plan.name === currentPlan;
            const Icon = plan.icon;
            return (
              <div
                key={plan.name}
                className={`card relative flex flex-col transition-all duration-200 ${
                  isCurrentPlan
                    ? "border-2 border-[var(--accent)] ring-1 ring-[var(--accent)]"
                    : "hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] cursor-pointer"
                }`}
                onClick={() => {
                  if (!isCurrentPlan) void openStripePortal();
                }}
                role={isCurrentPlan ? "article" : "button"}
                tabIndex={isCurrentPlan ? undefined : 0}
                onKeyDown={(e) => {
                  if (!isCurrentPlan && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    void openStripePortal();
                  }
                }}
                aria-current={isCurrentPlan ? true : undefined}
              >
                {/* Current plan indicator */}
                {isCurrentPlan && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-[var(--accent)] text-white text-[10px] font-display font-semibold rounded-full whitespace-nowrap uppercase tracking-widest">
                    Current
                  </div>
                )}

                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon
                      size={18}
                      className={
                        isCurrentPlan ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"
                      }
                    />
                    <h3 className="font-display font-semibold">{plan.label}</h3>
                  </div>
                </div>

                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-2xl font-mono font-bold">{plan.monthlyPrice}</span>
                  <span className="text-xs text-[var(--text-muted)]">/mo</span>
                </div>

                <p className="text-xs text-[var(--text-secondary)] mb-1">
                  {plan.credits} credits/mo
                </p>
                <p className="text-xs text-[var(--text-muted)] mb-5">{plan.description}</p>

                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="text-xs flex items-start gap-2">
                      <Check
                        className="shrink-0 mt-0.5"
                        size={12}
                        color={isCurrentPlan ? "var(--accent)" : "var(--text-muted)"}
                      />
                      <span className={isCurrentPlan ? "" : "text-[var(--text-secondary)]"}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {isCurrentPlan ? (
                  <div
                    className="btn btn-sm w-full btn-ghost cursor-default"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Current Plan
                  </div>
                ) : (
                  <div
                    className="btn btn-sm w-full btn-primary"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {plan.monthlyPrice === "€0" ? "Downgrade" : "Upgrade"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* === Billing Management === */}
      <div className="card">
        <h2 className="text-lg font-display font-semibold mb-4">Billing Management</h2>
        <div className="space-y-4">
          {/* Payment method row */}
          <div className="flex items-center justify-between p-4 border border-[var(--border)] rounded-lg">
            <div className="flex items-center gap-3">
              <CreditCard className="text-[var(--text-secondary)]" size={20} />
              <div>
                <p className="font-medium">Payment Method</p>
                <p className="text-sm text-[var(--text-muted)]">
                  Manage your payment method in Stripe
                </p>
              </div>
            </div>
            <button
              onClick={() => void openStripePortal()}
              disabled={portalLoading}
              className="btn btn-ghost btn-sm"
            >
              {portalLoading ? "Opening..." : "Update"}
            </button>
          </div>

          {/* Portal button */}
          <button
            onClick={() => void openStripePortal()}
            disabled={portalLoading}
            className="btn btn-primary btn-md"
          >
            {portalLoading ? "Opening..." : "Manage in Stripe"}
          </button>

          <p className="text-sm text-[var(--text-muted)]">
            Open the Stripe customer portal to update your payment method, view invoices, change
            your subscription plan, or cancel your subscription.
          </p>
        </div>
      </div>
    </div>
  );
}
