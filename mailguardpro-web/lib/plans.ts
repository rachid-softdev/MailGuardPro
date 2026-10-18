// Single source of truth for numeric plan entitlements: included validation
// credits and bulk row caps. Rate limits (requests per window) live in
// lib/rateLimits.ts; feature flags/limits live in
// services/feature-flags/planMatrix.ts and derive from these numbers where
// they overlap.
//
// Consumers: /api/v1/usage (display), /api/v1/validate/bulk (access gate),
// services/bulkProcessor (row cap), /api/stripe/webhook (credit grants),
// services/feature-flags/planMatrix (seeded entitlements).

import type { Plan } from "./rateLimits";

/**
 * Included validation credits per billing cycle.
 * -1 means unlimited (BUSINESS bypasses the credit gate in /api/v1/validate).
 */
export const PLAN_INCLUDED_CREDITS: Record<Plan, number> = {
  FREE: 100,
  STARTER: 5000,
  PRO: 50000,
  BUSINESS: -1,
};

/**
 * Maximum rows per bulk job.
 * 0 means the plan has no access to bulk validation (pricing card: FREE
 * only includes single email validation).
 * BUSINESS is effectively capped by the global processor limit (100k rows).
 */
export const PLAN_BULK_MAX_ROWS: Record<Plan, number> = {
  FREE: 0,
  STARTER: 10000,
  PRO: 100000,
  BUSINESS: 1000000,
};
