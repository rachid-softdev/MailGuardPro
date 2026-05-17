// Rate limiting par plan - Configuration et helper

import { redis } from './redis'

export type Plan = 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS'

// Configuration des limites par plan
export const PLAN_LIMITS = {
  FREE: {
    validate: { requests: 20, window: 60 },       // 20 req/min
    bulk: { requests: 1, window: 3600 },         // 1 job/hour
    bulkSize: 10000,                              // 10k rows max
    apiKeys: { requests: 2, window: 3600 },      // 2 clés/hour
    webhooks: { requests: 5, window: 3600 },     // 5 webhooks/hour
  },
  STARTER: {
    validate: { requests: 100, window: 60 },      // 100 req/min
    bulk: { requests: 5, window: 3600 },         // 5 jobs/hour
    bulkSize: 10000,                              // 10k rows max
    apiKeys: { requests: 5, window: 3600 },      // 5 clés/hour
    webhooks: { requests: 10, window: 3600 },    // 10 webhooks/hour
  },
  PRO: {
    validate: { requests: 500, window: 60 },      // 500 req/min
    bulk: { requests: 20, window: 3600 },        // 20 jobs/hour
    bulkSize: 100000,                             // 100k rows max
    apiKeys: { requests: 10, window: 3600 },     // 10 clés/hour
    webhooks: { requests: 20, window: 3600 },    // 20 webhooks/hour
  },
  BUSINESS: {
    validate: { requests: 999999, window: 60 },  // Unlimited
    bulk: { requests: 999999, window: 3600 },    // Unlimited
    bulkSize: 1000000,                            // 1M rows max
    apiKeys: { requests: 999999, window: 3600 }, // Unlimited
    webhooks: { requests: 999999, window: 3600 }, // Unlimited
  },
} as const

export type ActionType = keyof typeof PLAN_LIMITS['FREE']

// Helper pour récupérer les limites selon le plan
export function getPlanLimits(plan: Plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.FREE
}

// Check rate limit with plan-based limits
export async function checkRateLimitByPlan(
  userId: string,
  plan: Plan,
  action: ActionType
): Promise<{
  success: boolean
  remaining: number
  resetAt: number
  limit: number
}> {
  const limits = getPlanLimits(plan)
  const actionLimits = limits[action] as { requests: number; window: number }
  
  if (!actionLimits) {
    // Unknown action - use default
    return checkRateLimit(`user:${userId}:${action}`, 10, 60)
  }
  
  // Si illimité (BUSINESS)
  if (actionLimits.requests >= 999999) {
    return {
      success: true,
      remaining: 999999,
      resetAt: Date.now() + 60000,
      limit: 999999,
    }
  }
  
  // Vérifier le rate limit
  return checkRateLimit(`user:${userId}:${action}`, actionLimits.requests, actionLimits.window)
}

// Wrapper around redis checkRateLimit with better typing
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{
  success: boolean
  remaining: number
  resetAt: number
  limit: number
}> {
  const current = await redis.incr(`ratelimit:${key}`)
  
  if (current === 1) {
    await redis.expire(`ratelimit:${key}`, windowSeconds)
  }
  
  const ttl = await redis.ttl(`ratelimit:${key}`)
  const resetAt = Date.now() + (ttl > 0 ? ttl * 1000 : windowSeconds * 1000)
  
  return {
    success: current <= limit,
    remaining: Math.max(0, limit - current),
    resetAt,
    limit,
  }
}

// Rate limit exceeded error helper
export class RateLimitExceededError extends Error {
  constructor(
    public limit: number,
    public windowSeconds: number,
    public resetAt: number
  ) {
    super(`Rate limit exceeded. Try again in ${Math.ceil((resetAt - Date.now()) / 1000)} seconds`)
    this.name = 'RateLimitExceededError'
  }
}