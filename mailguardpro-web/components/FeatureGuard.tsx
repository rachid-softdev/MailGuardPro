"use client";

// ================================================================
// FeatureGuard — Conditional render based on feature flag
// ================================================================
// <FeatureGuard feature="EXPORT_PDF" fallback={<UpgradeBanner />}>
//   <ExportButton />
// </FeatureGuard>
// ================================================================

import React from "react";
import { useFeature, useLimit } from "@/services/feature-flags/entitlements-context";

interface FeatureGuardProps {
  feature: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function FeatureGuard({ feature, fallback = null, children }: FeatureGuardProps) {
  const isEnabled = useFeature(feature);

  if (!isEnabled) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// ---- Upgrade Banner (default fallback) ----

interface UpgradeBannerProps {
  message?: string;
}

export function UpgradeBanner({ message = "Upgrade to access this feature" }: UpgradeBannerProps) {
  return (
    <div className="border border-[var(--line)] border-l-2 border-l-[var(--accent)] bg-[var(--surface-2)] p-4 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        Plan limit
      </p>
      <p className="mt-1 text-[13px] text-[var(--ink-2)]">{message}</p>
      <a href="/billing/upgrade" className="btn btn-primary btn-sm mt-3">
        Upgrade Plan
      </a>
    </div>
  );
}

// ---- Usage Meter ----

interface UsageMeterProps {
  feature: string;
  showLabel?: boolean;
}

export function UsageMeter({ feature, showLabel = true }: UsageMeterProps) {
  const { limit, used, resetAt } = useLimit(feature);

  if (limit === null) {
    // Unlimited
    return (
      <div className="font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
        {showLabel && <span>Unlimited</span>}
      </div>
    );
  }

  const percentage = limit > 0 ? Math.min(Math.round((used / limit) * 100), 100) : 0;
  const isWarning = percentage >= 80;
  const isCritical = percentage >= 95;

  return (
    <div className="space-y-1">
      {showLabel && (
        <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.05em]">
          <span className="text-[var(--ink-3)]">
            {used} / {limit}
          </span>
          <span
            className={
              isCritical
                ? "text-[var(--status-invalid-text)]"
                : isWarning
                  ? "text-[var(--status-risky-text)]"
                  : "text-[var(--ink-2)]"
            }
          >
            {percentage}%
          </span>
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden bg-[var(--surface-3)]">
        <div
          className={`h-full transition-all ${
            isCritical
              ? "bg-[var(--status-invalid)]"
              : isWarning
                ? "bg-[var(--status-risky)]"
                : "bg-[var(--accent)]"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {resetAt && (
        <p className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
          Resets {new Date(resetAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}
