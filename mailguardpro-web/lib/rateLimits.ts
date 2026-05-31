// Rate limiting par plan - Configuration et helper

import { checkRateLimit } from "./redis";

export type Plan = "FREE" | "STARTER" | "PRO" | "BUSINESS";

// Configuration des limites par plan
export const PLAN_LIMITS = {
  FREE: {
    validate: { requests: 20, window: 60 }, // 20 req/min
    bulk: { requests: 1, window: 3600 }, // 1 job/hour
    bulkSize: 10000, // 10k rows max
    apiKeys: { requests: 2, window: 3600 }, // 2 clés/hour
    webhooks: { requests: 5, window: 3600 }, // 5 webhooks/hour
    billing: { requests: 3, window: 60 }, // 3 req/min
    export: { requests: 5, window: 3600 },
  },
  STARTER: {
    validate: { requests: 100, window: 60 }, // 100 req/min
    bulk: { requests: 5, window: 3600 }, // 5 jobs/hour
    bulkSize: 10000, // 10k rows max
    apiKeys: { requests: 5, window: 3600 }, // 5 clés/hour
    webhooks: { requests: 10, window: 3600 }, // 10 webhooks/hour
    billing: { requests: 10, window: 60 }, // 10 req/min
    export: { requests: 20, window: 3600 },
  },
  PRO: {
    validate: { requests: 500, window: 60 }, // 500 req/min
    bulk: { requests: 20, window: 3600 }, // 20 jobs/hour
    bulkSize: 100000, // 100k rows max
    apiKeys: { requests: 10, window: 3600 }, // 10 clés/hour
    webhooks: { requests: 20, window: 3600 }, // 20 webhooks/hour
    billing: { requests: 30, window: 60 }, // 30 req/min
    export: { requests: 100, window: 3600 },
  },
  BUSINESS: {
    validate: { requests: 999999, window: 60 }, // Unlimited
    bulk: { requests: 999999, window: 3600 }, // Unlimited
    bulkSize: 1000000, // 1M rows max
    apiKeys: { requests: 999999, window: 3600 }, // Unlimited
    webhooks: { requests: 999999, window: 3600 }, // Unlimited
    billing: { requests: 999999, window: 60 }, // Unlimited
    export: { requests: 999999, window: 3600 },
  },
} as const;

export type ActionType = keyof (typeof PLAN_LIMITS)["FREE"];
export type RateLimitAction = Exclude<ActionType, "bulkSize">;

// Helper pour récupérer les limites selon le plan
export function getPlanLimits(plan: Plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.FREE;
}

// Check rate limit with plan-based limits
export async function checkRateLimitByPlan(
  userId: string,
  plan: Plan,
  action: RateLimitAction,
): Promise<{
  success: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}> {
  const limits = getPlanLimits(plan);
  const actionLimits = limits[action] as { requests: number; window: number };

  if (!actionLimits) {
    // Unknown action - use default
    const fallbackResult = await checkRateLimit(`user:${userId}:${action}`, 10, 60);
    if (!fallbackResult.success) {
      console.warn(
        "[RateLimit] REJECTED",
        JSON.stringify({
          userId,
          plan,
          action,
          limit: fallbackResult.limit,
          window: 60,
          resetAt: new Date(fallbackResult.resetAt).toISOString(),
          source: "redis",
        }),
      );
    }
    return fallbackResult;
  }

  // Si illimité (BUSINESS) — still hit Redis with a very high limit for observability
  if (actionLimits.requests >= 999999) {
    // Use a high but finite limit to keep Redis tracking active
    // BUSINESS: 100K/min for validate, 5K/hour for bulk/apiKeys/webhooks
    const effectiveLimit = action === "validate" ? 100000 : 5000;
    const bizResult = await checkRateLimit(
      `user:${userId}:${action}:business`,
      effectiveLimit,
      actionLimits.window,
    );
    if (!bizResult.success) {
      console.warn(
        "[RateLimit] REJECTED",
        JSON.stringify({
          userId,
          plan,
          action,
          limit: bizResult.limit,
          window: actionLimits.window,
          resetAt: new Date(bizResult.resetAt).toISOString(),
          source: "redis",
        }),
      );
    }
    return bizResult;
  }

  // Vérifier le rate limit
  const rateCheckResult = await checkRateLimit(
    `user:${userId}:${action}`,
    actionLimits.requests,
    actionLimits.window,
  );
  if (!rateCheckResult.success) {
    console.warn(
      "[RateLimit] REJECTED",
      JSON.stringify({
        userId,
        plan,
        action,
        limit: rateCheckResult.limit,
        window: actionLimits.window,
        resetAt: new Date(rateCheckResult.resetAt).toISOString(),
        source: "redis",
      }),
    );
  }
  return rateCheckResult;
}

// Rate limit exceeded error helper
export class RateLimitExceededError extends Error {
  constructor(
    public limit: number,
    public windowSeconds: number,
    public resetAt: number,
  ) {
    // Round resetAt to nearest 10 seconds to prevent precise timing leakage
    const roundedResetAt = Math.ceil(resetAt / 10000) * 10000;
    super(
      `Rate limit exceeded. Try again in approximately ${Math.ceil((roundedResetAt - Date.now()) / 1000)} seconds`,
    );
    this.name = "RateLimitExceededError";
    this.resetAt = roundedResetAt;
  }
}
