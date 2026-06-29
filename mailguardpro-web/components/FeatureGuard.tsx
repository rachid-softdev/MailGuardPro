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
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center dark:border-amber-800 dark:bg-amber-950">
      <p className="text-sm text-amber-800 dark:text-amber-200">{message}</p>
      <a
        href="/billing/upgrade"
        className="mt-2 inline-block rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
      >
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
      <div className="text-sm text-green-600 dark:text-green-400">
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
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            {used} / {limit}
          </span>
          <span
            className={isCritical ? "text-red-600" : isWarning ? "text-amber-600" : "text-gray-500"}
          >
            {percentage}%
          </span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={`h-full rounded-full transition-all ${
            isCritical ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-blue-500"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {resetAt && (
        <p className="text-xs text-gray-400">Resets {new Date(resetAt).toLocaleDateString()}</p>
      )}
    </div>
  );
}
