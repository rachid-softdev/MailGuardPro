// =====================================================
// FEATURE GATE SERVICE - CORE LOGIC
// =====================================================

import type {
  FeatureType,
  EntitlementMap,
  DebugTrace,
  ConsumeResult,
  CachedEntitlements,
  ExperimentConfig,
  ResolvedVia,
  UserEntitlements,
} from './types'
import { SUBSCRIPTION_ACTIVE_STATUSES } from './types'
import { entitlementRepository, type IEntitlementRepository } from './repository'
import { entitlementsCache } from './cache'
import { resolveExperimentBucket } from './experiments'

// Simple logger
const logger = {
  info: (msg: string, meta?: any) => console.log(`[FeatureGate] ${msg}`, meta ?? ''),
  warn: (msg: string, meta?: any) => console.warn(`[FeatureGate] ${msg}`, meta ?? ''),
  error: (msg: string, meta?: any) => console.error(`[FeatureGate] ${msg}`, meta ?? ''),
}

// =====================================================
// SERVICE CLASS
// =====================================================

export class FeatureGateService {
  constructor(
    private repo: IEntitlementRepository,
    private cache = entitlementsCache
  ) {}

  // =====================================================
  // HAS FEATURE - Check if feature is enabled
  // =====================================================

  async hasFeature(orgId: string, featureKey: string, userId?: string): Promise<boolean> {
    const resolved = await this.resolveFeature(orgId, featureKey, userId)
    return resolved.value as boolean
  }

  // =====================================================
  // GET LIMIT - Get numeric limit for a feature
  // =====================================================

  async getLimit(orgId: string, limitKey: string, userId?: string): Promise<number | null> {
    const resolved = await this.resolveFeature(orgId, limitKey, userId)
    return resolved.value as number | null
  }

  // =====================================================
  // ASSERT FEATURE - Throw 403 if not enabled
  // =====================================================

  async assertFeature(orgId: string, featureKey: string, userId?: string): Promise<void> {
    const hasIt = await this.hasFeature(orgId, featureKey, userId)
    if (!hasIt) {
      const subscription = await this.repo.getActiveSubscription(orgId)
      const currentPlan = subscription?.planKey ?? 'free'
      
      const error: any = new Error(`Feature not available: ${featureKey}`)
      error.code = 'FEATURE_NOT_AVAILABLE'
      error.feature = featureKey
      error.plan_required = await this.getRequiredPlan(featureKey)
      error.current_plan = currentPlan
      error.upgrade_url = '/billing/upgrade'
      throw error
    }
  }

  // =====================================================
  // CAN CONSUME - Check if can consume quota
  // =====================================================

  async canConsume(orgId: string, featureKey: string, amount = 1, userId?: string): Promise<boolean> {
    // First check if feature is enabled
    const hasFeature = await this.hasFeature(orgId, featureKey, userId)
    if (!hasFeature) return false

    // Get the limit from plan/override
    const limit = await this.getLimit(orgId, featureKey, userId)
    
    // null = unlimited
    if (limit === null) return true

    // Get current usage
    const usage = await this.repo.getUsageForCurrentPeriod(orgId, featureKey)
    const used = usage?.usageCount ?? 0

    return used + amount <= limit
  }

  // =====================================================
  // CONSUME - Atomically consume quota
  // =====================================================

  async consume(
    orgId: string,
    featureKey: string,
    amount = 1,
    userId?: string
  ): Promise<ConsumeResult> {
    // First check if feature is enabled
    const hasFeature = await this.hasFeature(orgId, featureKey, userId)
    if (!hasFeature) {
      const subscription = await this.repo.getActiveSubscription(orgId)
      throw {
        error: 'FEATURE_NOT_AVAILABLE' as const,
        feature: featureKey,
        plan_required: await this.getRequiredPlan(featureKey),
        current_plan: subscription?.planKey ?? 'free',
        upgrade_url: '/billing/upgrade',
      }
    }

    // Get the limit
    const limit = await this.getLimit(orgId, featureKey, userId)
    
    // Get current period info
    const usage = await this.repo.getUsageForCurrentPeriod(orgId, featureKey)
    const used = usage?.usageCount ?? 0

    // Try to increment (atomic with limit check)
    const result = await this.repo.incrementUsage(orgId, featureKey, amount)

    if (!result.success) {
      // Limit would be exceeded
      const subscription = await this.repo.getActiveSubscription(orgId)
      throw {
        error: 'LIMIT_REACHED' as const,
        feature: featureKey,
        limit: limit ?? 0,
        used: used + amount,
        reset_at: usage?.periodEnd?.toISOString() ?? new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString(),
        upgrade_url: '/billing/upgrade',
      }
    }

    // Invalidate cache after consume
    await this.invalidateCache(orgId)

    return {
      success: true,
      featureKey,
      newUsageCount: result.newCount,
      limit: result.limit,
      remaining: result.limit !== null ? result.limit - result.newCount : null,
    }
  }

  // =====================================================
  // GET ALL ENTITLEMENTS - Full entitlement map
  // =====================================================

  async getAllEntitlements(orgId: string, userId?: string): Promise<EntitlementMap> {
    // Try cache first
    const cached = await this.cache.get(orgId)
    if (cached) {
      return this.cacheToEntitlementMap(cached, orgId, userId)
    }

    // Build from scratch
    const entitlements = await this.buildEntitlements(orgId, userId)

    // Cache it
    await this.cache.set(orgId, {
      plan: entitlements.plan,
      features: entitlements.features,
      limits: entitlements.limits,
      cachedAt: Date.now(),
      ttl: 300000,
    })

    return entitlements
  }

  // =====================================================
  // GET DEBUG TRACE - Debug info for a feature
  // =====================================================

  async getDebugTrace(orgId: string, featureKey: string, userId?: string): Promise<DebugTrace> {
    const resolved = await this.resolveFeature(orgId, featureKey, userId)
    return resolved
  }

  // =====================================================
  // INVALIDATE CACHE
  // =====================================================

  async invalidateCache(orgId: string): Promise<void> {
    await this.cache.invalidate(orgId)
    // Also publish to other instances
    await this.cache.publishInvalidation(orgId)
    logger.info(`Cache invalidated for org ${orgId}`)
  }

  // =====================================================
  // PRIVATE: BUILD ENTITLEMENTS
  // =====================================================

  private async buildEntitlements(orgId: string, userId?: string): Promise<EntitlementMap> {
    const subscription = await this.repo.getActiveSubscription(orgId)
    const planKey = subscription?.planKey ?? 'free'

    // Get plan features
    const planFeatures = await this.repo.getPlanFeatures(planKey)

    // Get all features (for experiments)
    const features = await this.repo.getAllFeatures()

    // Get usage for current period
    const usageMap: Record<string, number> = {}
    const resetAtMap: Record<string, string> = {}

    for (const pf of planFeatures) {
      const usage = await this.repo.getUsageForCurrentPeriod(orgId, pf.featureId)
      if (usage) {
        usageMap[pf.featureId] = usage.usageCount
        resetAtMap[pf.featureId] = usage.periodEnd.toISOString()
      }
    }

    const featuresMap: Record<string, boolean> = {}
    const limitsMap: Record<string, number | null> = {}
    const experimentsMap: Record<string, boolean> = {}

    for (const feature of features) {
      const resolved = await this.resolveFeature(orgId, feature.key, userId)
      
      if (feature.type === 'EXPERIMENT') {
        experimentsMap[feature.key] = resolved.value as boolean
      } else if (feature.type === 'LIMIT') {
        limitsMap[feature.key] = resolved.value as number | null
      } else {
        featuresMap[feature.key] = resolved.value as boolean
      }
    }

    return {
      plan: planKey,
      features: featuresMap,
      limits: limitsMap,
      usage: usageMap,
      reset_at: resetAtMap,
      experiments: experimentsMap,
    }
  }

  private cacheToEntitlementMap(cached: CachedEntitlements, orgId: string, userId?: string): EntitlementMap {
    // Build usage map fresh (not cached)
    const usageMap: Record<string, number> = {}
    const resetAtMap: Record<string, string> = {}

    return {
      plan: cached.plan,
      features: cached.features,
      limits: cached.limits,
      usage: usageMap,
      reset_at: resetAtMap,
      experiments: {}, // Will be resolved on demand
    }
  }

  // =====================================================
  // PRIVATE: RESOLVE FEATURE - Priority System
  // =====================================================

  private async resolveFeature(
    orgId: string,
    featureKey: string,
    userId?: string
  ): Promise<DebugTrace> {
    const now = new Date()

    // 1. User override (highest priority)
    if (userId) {
      const userOverride = await this.repo.getOverride('USER', userId, featureKey)
      if (userOverride && (!userOverride.expiresAt || userOverride.expiresAt > now)) {
        return {
          featureKey,
          resolvedVia: 'user_override',
          value: userOverride.enabled,
          overrideId: userOverride.id,
          expiresAt: userOverride.expiresAt ?? undefined,
          overrideScope: 'USER',
          overrideScopeId: userId,
        }
      }
    }

    // 2. Organization override
    const orgOverride = await this.repo.getOverride('ORG', orgId, featureKey)
    if (orgOverride && (!orgOverride.expiresAt || orgOverride.expiresAt > now)) {
      return {
        featureKey,
        resolvedVia: 'org_override',
        value: orgOverride.enabled,
        overrideId: orgOverride.id,
        expiresAt: orgOverride.expiresAt ?? undefined,
        overrideScope: 'ORG',
        overrideScopeId: orgId,
      }
    }

    // 3. Plan (from active subscription)
    const subscription = await this.repo.getActiveSubscription(orgId)
    if (subscription && SUBSCRIPTION_ACTIVE_STATUSES.includes(subscription.status)) {
      // Get plan features
      const planFeatures = await this.repo.getPlanFeatures(subscription.planKey)

      // Get the feature to know type
      const feature = await this.repo.getFeature(featureKey)
      if (!feature) {
        return {
          featureKey,
          resolvedVia: 'fallback',
          value: false,
          planKey: subscription.planKey,
        }
      }

      // Find plan feature matching this feature
      const pf = planFeatures.find((p) => p.featureId === feature.id)

      if (pf) {
        if (feature.type === 'EXPERIMENT') {
          // Handle experiments
          const config = pf.configJson as ExperimentConfig | null
          const defaultConfig = feature.defaultConfig as ExperimentConfig | null
          const expConfig = config ?? defaultConfig

          if (expConfig && userId) {
            const bucket = resolveExperimentBucket(expConfig.seed, userId)
            const inExperiment = bucket < expConfig.percentage
            return {
              featureKey,
              resolvedVia: 'plan',
              value: inExperiment,
              planKey: subscription.planKey,
              experimentBucket: bucket,
              inExperiment,
            }
          }
        }

        return {
          featureKey,
          resolvedVia: 'plan',
          value: feature.type === 'LIMIT' ? pf.limitValue : pf.enabled,
          planKey: subscription.planKey,
        }
      }
    }

    // 4. Fallback - disabled
    return {
      featureKey,
      resolvedVia: 'fallback',
      value: false,
    }
  }

  // =====================================================
  // PRIVATE: GET REQUIRED PLAN
  // =====================================================

  private async getRequiredPlan(featureKey: string): Promise<string> {
    // Find the first plan that has this feature enabled
    const plans = await this.repo.getAllPlans()
    
    for (const plan of plans) {
      const features = await this.repo.getPlanFeatures(plan.key)
      const hasFeature = features.some((f) => {
        // We need to match feature key
        return f.enabled
      })
      
      if (hasFeature) {
        return plan.key.toUpperCase()
      }
    }

    return 'PRO'
  }
}

// Export singleton
export const featureGateService = new FeatureGateService(entitlementRepository)