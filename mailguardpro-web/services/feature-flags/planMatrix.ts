// ================================================================
// Plan Matrix — Single Source of Truth for Plan/Feature Entitlements
// ================================================================
// This module defines:
//   - Every pricing plan and its rank (order = lowest → highest)
//   - Every feature (flag) that exists in the product
//   - Which features each plan can access (enabled + limits)
//
// It is shared by:
//   - prisma/seed.ts            (seeds the database from this matrix)
//   - featureGateService.ts     (resolution + top-plan rules)
//   - __tests__/planMatrix.test.ts (verifies the whole matrix works)
//
// Rule: the highest-ranked plan (BUSINESS) can access EVERY feature,
// including features that are not explicitly mapped to it. Lower plans
// can only access the features explicitly granted in PLAN_FEATURE_MAP.
// ================================================================

// Numeric entitlements (included credits, bulk row caps) come from the
// shared source of truth in lib/plans.ts so the seeded DB limits can never
// drift from the runtime enforcement (usage API, bulk upload, webhooks).
import { PLAN_INCLUDED_CREDITS } from "../../lib/plans";

// ---- Plan ranking (lowest → highest) ----
export const PLAN_ORDER = ["FREE", "STARTER", "PRO", "BUSINESS"] as const;

export type PlanKey = (typeof PLAN_ORDER)[number];

export type PlanFeatureType = "BOOLEAN" | "LIMIT" | "EXPERIMENT";

export interface FeatureDefinition {
  key: string;
  description: string;
  type: PlanFeatureType;
  defaultConfig: Record<string, unknown>;
}

export interface PlanDefinition {
  key: string;
  name: string;
  priceMonthly: number;
  stripePriceId: string | null;
}

export interface PlanFeatureDefinition {
  key: string;
  enabled: boolean;
  limit?: number | null;
  strategy?: string;
}

// ---- Features ----
export const FEATURES: FeatureDefinition[] = [
  {
    key: "EXPORT_PDF",
    description: "Export emails to PDF",
    type: "BOOLEAN",
    defaultConfig: {},
  },
  {
    key: "AI_SUMMARY",
    description: "AI-powered email summary",
    type: "BOOLEAN",
    defaultConfig: {},
  },
  {
    key: "BULK_VALIDATE",
    description: "Bulk email validation credits",
    type: "LIMIT",
    defaultConfig: {},
  },
  {
    key: "API_ACCESS",
    description: "REST API access",
    type: "BOOLEAN",
    defaultConfig: {},
  },
  {
    key: "TEAM_MEMBERS",
    description: "Number of team members",
    type: "LIMIT",
    defaultConfig: {},
  },
  {
    key: "CUSTOM_HEADERS",
    description: "Custom email headers",
    type: "BOOLEAN",
    defaultConfig: {},
  },
  {
    key: "WEBHOOKS",
    description: "Webhook integrations",
    type: "BOOLEAN",
    defaultConfig: {},
  },
  {
    key: "SCHEDULED_EXPORTS",
    description: "Scheduled automated exports",
    type: "BOOLEAN",
    defaultConfig: {},
  },
  {
    key: "NEW_DASHBOARD",
    description: "New dashboard experience (A/B test)",
    type: "EXPERIMENT",
    defaultConfig: { percentage: 50, seed: "NEW_DASHBOARD_v1" },
  },
  {
    key: "ADVANCED_FILTERS",
    description: "Advanced filter operators",
    type: "BOOLEAN",
    defaultConfig: {},
  },
  {
    key: "WHITELABEL",
    description: "White-label exports",
    type: "BOOLEAN",
    defaultConfig: {},
  },
  {
    key: "PRIORITY_SUPPORT",
    description: "Priority customer support",
    type: "BOOLEAN",
    defaultConfig: {},
  },
];

// ---- Plans ----
export const PLANS: PlanDefinition[] = [
  { key: "FREE", name: "Free", priceMonthly: 0, stripePriceId: null },
  { key: "STARTER", name: "Starter", priceMonthly: 900, stripePriceId: null },
  { key: "PRO", name: "Professional", priceMonthly: 2900, stripePriceId: null },
  { key: "BUSINESS", name: "Business", priceMonthly: 9900, stripePriceId: null },
];

// ---- Plan → Feature matrix ----
// BUSINESS (top plan) grants every feature. Entries with `enabled: false`
// exist for lower plans so they are explicit about what they cannot access.
export const PLAN_FEATURE_MAP: Record<string, PlanFeatureDefinition[]> = {
  FREE: [
    { key: "EXPORT_PDF", enabled: false },
    { key: "AI_SUMMARY", enabled: false },
    // FREE only includes single email validation (pricing card) — bulk
    // uploads are gated at /api/v1/validate/bulk via PLAN_BULK_MAX_ROWS.
    { key: "BULK_VALIDATE", enabled: false },
    { key: "API_ACCESS", enabled: false },
    { key: "TEAM_MEMBERS", enabled: true, limit: 1 },
    { key: "CUSTOM_HEADERS", enabled: false },
    { key: "WEBHOOKS", enabled: false },
    { key: "SCHEDULED_EXPORTS", enabled: false },
    { key: "NEW_DASHBOARD", enabled: true },
    { key: "ADVANCED_FILTERS", enabled: false },
    { key: "WHITELABEL", enabled: false },
    { key: "PRIORITY_SUPPORT", enabled: false },
  ],
  STARTER: [
    { key: "EXPORT_PDF", enabled: false },
    { key: "AI_SUMMARY", enabled: false },
    { key: "BULK_VALIDATE", enabled: true, limit: PLAN_INCLUDED_CREDITS.STARTER },
    { key: "API_ACCESS", enabled: true },
    { key: "TEAM_MEMBERS", enabled: true, limit: 3 },
    { key: "CUSTOM_HEADERS", enabled: false },
    { key: "WEBHOOKS", enabled: false },
    { key: "SCHEDULED_EXPORTS", enabled: false },
    { key: "NEW_DASHBOARD", enabled: true },
    { key: "ADVANCED_FILTERS", enabled: false },
    { key: "WHITELABEL", enabled: false },
    { key: "PRIORITY_SUPPORT", enabled: false },
  ],
  PRO: [
    { key: "EXPORT_PDF", enabled: true },
    { key: "AI_SUMMARY", enabled: true },
    { key: "BULK_VALIDATE", enabled: true, limit: PLAN_INCLUDED_CREDITS.PRO },
    { key: "API_ACCESS", enabled: true },
    { key: "TEAM_MEMBERS", enabled: true, limit: 10 },
    { key: "CUSTOM_HEADERS", enabled: true },
    { key: "WEBHOOKS", enabled: true },
    { key: "SCHEDULED_EXPORTS", enabled: true },
    { key: "NEW_DASHBOARD", enabled: true },
    { key: "ADVANCED_FILTERS", enabled: true },
    { key: "WHITELABEL", enabled: false },
    { key: "PRIORITY_SUPPORT", enabled: false },
  ],
  BUSINESS: [
    { key: "EXPORT_PDF", enabled: true },
    { key: "AI_SUMMARY", enabled: true },
    { key: "BULK_VALIDATE", enabled: true, limit: null }, // unlimited
    { key: "API_ACCESS", enabled: true },
    { key: "TEAM_MEMBERS", enabled: true, limit: null }, // unlimited
    { key: "CUSTOM_HEADERS", enabled: true },
    { key: "WEBHOOKS", enabled: true },
    { key: "SCHEDULED_EXPORTS", enabled: true },
    { key: "NEW_DASHBOARD", enabled: true },
    { key: "ADVANCED_FILTERS", enabled: true },
    { key: "WHITELABEL", enabled: true },
    { key: "PRIORITY_SUPPORT", enabled: true },
  ],
};

// ---- Helpers ----

/** Key of the highest-ranked plan (the one that can access everything). */
export function getTopPlanKey(): PlanKey {
  return PLAN_ORDER[PLAN_ORDER.length - 1];
}

/**
 * Rank of a plan key. Plans not in PLAN_ORDER (e.g. "ENTERPRISE" in tests)
 * get a rank after all known plans, so they are still orderable.
 */
export function getPlanRank(planKey: string): number {
  const idx = PLAN_ORDER.indexOf(planKey as PlanKey);
  return idx === -1 ? PLAN_ORDER.length : idx;
}
