// ================================================================
// FeatureGateService — Central Service for Feature Flags & Entitlements
// ================================================================
// This service is the SINGLE source of truth for all feature access.
// No `if(plan === "PRO")` anywhere in endpoints — all goes through here.
//
// Resolution priority (stop at first match):
//   1. Override user (scope=user, non-expired)
//   2. Override org  (scope=org, non-expired)
//   3. Active plan (subscription.status in [active, trialing])
//   4. Fallback → disabled, limit = 0
// ================================================================

import type { ICacheService } from "./cacheService";
import type { IEntitlementRepository } from "./entitlementRepository";
import type {
  ConsumeResult,
  ConsumeResultFailure,
  ConsumeResultSuccess,
  DebugTrace,
  EntitlementMap,
  FeatureType,
  ResolvedVia,
} from "./types";
import { FeatureNotAvailableError, hashExperimentBucket } from "./types";

// ---- Cache Payload stored in Redis/Memory ----
interface EntitlementCache {
  plan: string;
  planKey: string;
  features: Record<string, boolean>;
  limits: Record<string, number | null>;
  configs: Record<string, Record<string, unknown> | null>;
  types: Record<string, FeatureType>;
  usage: Record<string, number>;
  reset_at: Record<string, string | null>;
  _cachedAt: string;
}

export class FeatureGateService {
  constructor(
    private readonly repo: IEntitlementRepository,
    private readonly cache: ICacheService,
  ) {}

  // ================================================================
  // Public API
  // ================================================================

  /**
   * Check if a feature is enabled for an organization.
   * For "experiment" features, this returns true if the user is in the experiment.
   * Use `isInExperiment()` for granular A/B test checks.
   */
  async hasFeature(orgId: string, featureKey: string, userId?: string): Promise<boolean> {
    const trace = await this.resolveFeature(orgId, featureKey, userId);
    return trace.enabled;
  }

  /**
   * Get the numeric limit for a feature.
   * Returns `null` for unlimited (Enterprise).
   */
  async getLimit(orgId: string, limitKey: string): Promise<number | null> {
    const trace = await this.resolveFeature(orgId, limitKey);
    return trace.limit;
  }

  /**
   * Assert that a feature is available. Throws FeatureNotAvailableError (HTTP 403) if not.
   */
  async assertFeature(orgId: string, featureKey: string, userId?: string): Promise<void> {
    const trace = await this.resolveFeature(orgId, featureKey, userId);
    if (!trace.enabled) {
      const planKey = trace.planKey ?? "FREE";
      throw new FeatureNotAvailableError(
        featureKey,
        this.getRequiredPlan(featureKey, planKey),
        planKey,
      );
    }
  }

  /**
   * Check if an org can consume N units of a feature without actually consuming.
   */
  async canConsume(orgId: string, featureKey: string, n = 1): Promise<boolean> {
    const limit = await this.getLimit(orgId, featureKey);
    if (limit === null) return true; // unlimited

    const now = new Date();
    const { periodStart, periodEnd } = this.getMonthlyPeriod(now);

    const usage = await this.repo.getUsage(orgId, featureKey, periodStart, periodEnd);
    const currentUsage = usage?.usage_count ?? 0;

    return currentUsage + n <= limit;
  }

  /**
   * Consume N units of a feature. Returns success or failure with details.
   * Uses atomic increment to prevent race conditions.
   */
  async consume(orgId: string, featureKey: string, n = 1): Promise<ConsumeResult> {
    const limit = await this.getLimit(orgId, featureKey);
    if (limit === null) {
      // Unlimited — just record usage for analytics
      return {
        success: true,
        remaining: -1,
        limit: -1,
        usage: 0,
        reset_at: "",
      };
    }

    const now = new Date();
    const { periodStart, periodEnd } = this.getMonthlyPeriod(now);

    const result = await this.repo.upsertUsage(orgId, featureKey, periodStart, periodEnd, n);

    // Plan-level limit check (from the DB/repo's limit_reached calculation).
    if (result.limit_reached) {
      // Usage has exceeded the plan-level limit
      const used = result.usage_count;

      // Invalidate cache so usage numbers refresh
      await this.cache.invalidate(orgId);

      return {
        success: false,
        error: "LIMIT_REACHED",
        feature: featureKey,
        limit,
        used,
        reset_at: periodEnd.toISOString(),
        upgrade_url: "/billing/upgrade",
      } satisfies ConsumeResultFailure;
    }

    // Additional check: the effective limit from getLimit() accounts for
    // overrides like freeze (limit=0). We only apply this when BOTH the
    // feature and an active subscription exist — without a subscription
    // the fallback returns limit=0 meaning "unknown", not "frozen".
    const feature = await this.repo.getFeatureByKey(featureKey);
    const sub = await this.repo.getActiveSubscription(orgId);
    if (sub && feature && limit !== null && result.usage_count > limit) {
      // Usage has exceeded the effective limit (including overrides like freeze)
      const used = result.usage_count;

      // Invalidate cache so usage numbers refresh
      await this.cache.invalidate(orgId);

      return {
        success: false,
        error: "LIMIT_REACHED",
        feature: featureKey,
        limit,
        used,
        reset_at: periodEnd.toISOString(),
        upgrade_url: "/billing/upgrade",
      } satisfies ConsumeResultFailure;
    }

    // Invalidate cache so usage numbers refresh
    await this.cache.invalidate(orgId);

    return {
      success: true,
      remaining: limit - result.usage_count,
      limit,
      usage: result.usage_count,
      reset_at: periodEnd.toISOString(),
    } satisfies ConsumeResultSuccess;
  }

  /**
   * Get ALL entitlements for an organization in a single call.
   * This is cached (Redis + memory). Used by the frontend endpoint.
   */
  async getAllEntitlements(orgId: string): Promise<EntitlementMap> {
    // Try cache first
    const cached = await this.cache.get(orgId);
    if (cached) {
      const cc = cached as unknown as EntitlementCache;
      return {
        plan: cc.plan,
        features: cc.features,
        limits: cc.limits,
        configs: cc.configs,
        usage: cc.usage,
        reset_at: cc.reset_at,
      };
    }

    const data = await this.buildEntitlementCache(orgId);
    await this.cache.set(orgId, data as unknown as Record<string, unknown>);

    return {
      plan: data.plan,
      features: data.features,
      limits: data.limits,
      configs: data.configs,
      usage: data.usage,
      reset_at: data.reset_at,
    };
  }

  /**
   * Get a full debug trace for a feature, showing how the value was resolved.
   */
  async getDebugTrace(orgId: string, featureKey: string, userId?: string): Promise<DebugTrace> {
    // Get plan-level info first
    const sub = await this.repo.getActiveSubscription(orgId);
    const planKey = sub?.plan_key ?? "FREE";
    const planFeatures = await this.repo.getPlanFeatures(planKey);
    const pf = planFeatures.find((f) => f.feature_key === featureKey);

    const planEnabled = pf?.enabled ?? false;
    const planLimit = pf?.limit_value ?? null;

    // Get overrides
    const orgOverrides = await this.repo.getOverrides("org", orgId, featureKey);
    const userOverrides = userId ? await this.repo.getOverrides("user", userId, featureKey) : [];

    // Resolve
    const trace = await this.resolveFeature(orgId, featureKey, userId);

    return {
      featureKey,
      resolvedVia: trace.resolvedVia,
      enabled: trace.enabled,
      limit: trace.limit,
      overrideId: trace.overrideId,
      expiresAt: trace.expiresAt,
      planKey,
      planEnabled,
      planLimit,
      orgOverrides: orgOverrides.map((o) => ({
        id: o.id,
        enabled: o.enabled,
        limit_value: o.limit_value,
        expires_at: o.expires_at?.toISOString() ?? null,
      })),
      userOverrides: userOverrides.map((o) => ({
        id: o.id,
        enabled: o.enabled,
        limit_value: o.limit_value,
        expires_at: o.expires_at?.toISOString() ?? null,
      })),
    };
  }

  /**
   * Invalidate cache for an organization.
   */
  async invalidateCache(orgId: string): Promise<void> {
    await this.cache.invalidate(orgId);
  }

  // ================================================================
  // Experiment (A/B Testing)
  // ================================================================

  /**
   * Check if a user is in an A/B experiment.
   * Uses stable hashing — same user always gets the same bucket.
   */
  async isInExperiment(userId: string, experimentKey: string): Promise<boolean> {
    const config = await this.getExperimentConfig(experimentKey);
    if (!config) return false;

    const bucket = hashExperimentBucket(config.seed, userId);
    return bucket < config.percentage;
  }

  /**
   * Get the experiment configuration for a feature.
   */
  async getExperimentConfig(experimentKey: string): Promise<{
    percentage: number;
    seed: string;
  } | null> {
    const feature = await this.repo.getFeatureByKey(experimentKey);
    if (!feature || feature.type !== "experiment") return null;

    const config = feature.default_config ?? {};
    const percentage = (config as { percentage?: number }).percentage ?? 0;
    const seed = (config as { seed?: string }).seed ?? experimentKey;

    return { percentage, seed };
  }

  // ================================================================
  // Internal Resolution
  // ================================================================

  private async resolveFeature(
    orgId: string,
    featureKey: string,
    userId?: string,
  ): Promise<{
    enabled: boolean;
    limit: number | null;
    resolvedVia: ResolvedVia;
    overrideId?: string;
    expiresAt?: string;
    planKey?: string;
  }> {
    // Ensure feature exists
    const feature = await this.repo.getFeatureByKey(featureKey);
    if (!feature) {
      return { enabled: false, limit: 0, resolvedVia: "fallback" };
    }

    const now = new Date();

    // Step 1: User override (if userId provided)
    if (userId) {
      const userOverrides = await this.repo.getOverrides("user", userId, featureKey);
      const validOverride = userOverrides.find(
        (o) => !o.expires_at || new Date(o.expires_at) > now,
      );
      if (validOverride) {
        return this.applyOverride(validOverride, feature.type, featureKey);
      }
    }

    // Step 2: Org override
    const orgOverrides = await this.repo.getOverrides("org", orgId, featureKey);
    const validOverride = orgOverrides.find((o) => !o.expires_at || new Date(o.expires_at) > now);
    if (validOverride) {
      return this.applyOverride(validOverride, feature.type, featureKey);
    }

    // Step 3: Active plan
    const sub = await this.repo.getActiveSubscription(orgId);
    if (sub) {
      const planFeatures = await this.repo.getPlanFeatures(sub.plan_key);
      const pf = planFeatures.find((f) => f.feature_key === featureKey);
      if (pf) {
        return {
          enabled: pf.enabled,
          limit: pf.limit_value ?? null,
          resolvedVia: "plan",
          planKey: sub.plan_key,
        };
      }
    }

    // Step 4: Fallback
    return { enabled: false, limit: 0, resolvedVia: "fallback" };
  }

  private applyOverride(
    override: {
      id: string;
      scope: "org" | "user";
      enabled: boolean | null;
      limit_value: number | null;
      expires_at: Date | null;
    },
    featureType: FeatureType,
    _featureKey: string,
  ): {
    enabled: boolean;
    limit: number | null;
    resolvedVia: ResolvedVia;
    overrideId: string;
    expiresAt?: string;
  } {
    const scope = override.scope === "org" ? "org_override" : "user_override";

    if (featureType === "boolean" || featureType === "experiment") {
      return {
        enabled: override.enabled ?? false,
        limit: null,
        resolvedVia: scope as ResolvedVia,
        overrideId: override.id,
        expiresAt: override.expires_at?.toISOString(),
      };
    }

    // limit type
    return {
      enabled: override.enabled ?? true,
      limit: override.limit_value ?? null, // null = unlimited
      resolvedVia: scope as ResolvedVia,
      overrideId: override.id,
      expiresAt: override.expires_at?.toISOString(),
    };
  }

  private async buildEntitlementCache(orgId: string): Promise<EntitlementCache> {
    const sub = await this.repo.getActiveSubscription(orgId);
    const planKey = sub?.plan_key ?? "FREE";
    const planFeatures = await this.repo.getPlanFeatures(planKey);
    const allFeatures = await this.repo.listFeatures(1, 1000);
    const now = new Date();
    const { periodStart, periodEnd } = this.getMonthlyPeriod(now);

    const features: Record<string, boolean> = {};
    const limits: Record<string, number | null> = {};
    const configs: Record<string, Record<string, unknown> | null> = {};
    const types: Record<string, FeatureType> = {};
    const usage: Record<string, number> = {};
    const reset_at: Record<string, string | null> = {};

    // Check for org-level overrides
    const orgOverrides = await this.repo.getOverrides("org", orgId);
    const overrideMap = new Map<string, { enabled: boolean | null; limit_value: number | null }>();
    for (const ov of orgOverrides) {
      if (!ov.expires_at || new Date(ov.expires_at) > now) {
        overrideMap.set(ov.feature_key, { enabled: ov.enabled, limit_value: ov.limit_value });
      }
    }

    // Build plan feature map
    const planFeatureMap = new Map(planFeatures.map((pf) => [pf.feature_key, pf]));

    // Process all features
    for (const feat of allFeatures.data) {
      const pf = planFeatureMap.get(feat.key);
      const ov = overrideMap.get(feat.key);

      types[feat.key] = feat.type;

      if (feat.type === "boolean" || feat.type === "experiment") {
        features[feat.key] = ov?.enabled ?? pf?.enabled ?? false;
        limits[feat.key] = null;
      } else {
        // limit type
        features[feat.key] = ov?.enabled ?? pf?.enabled ?? false;
        limits[feat.key] = ov?.limit_value ?? pf?.limit_value ?? null;
      }

      configs[feat.key] = pf?.config_json ?? feat.default_config ?? null;

      // Get usage for limit-type features
      if (feat.type === "limit") {
        try {
          const usageRow = await this.repo.getUsage(orgId, feat.key, periodStart, periodEnd);
          usage[feat.key] = usageRow?.usage_count ?? 0;
          reset_at[feat.key] = periodEnd.toISOString();
        } catch {
          usage[feat.key] = 0;
          reset_at[feat.key] = periodEnd.toISOString();
        }
      } else {
        usage[feat.key] = 0;
        reset_at[feat.key] = null;
      }
    }

    return {
      plan: sub?.status ?? "none",
      planKey,
      features,
      limits,
      configs,
      types,
      usage,
      reset_at,
      _cachedAt: now.toISOString(),
    };
  }

  // ================================================================
  // Helpers
  // ================================================================

  private getMonthlyPeriod(now: Date): { periodStart: Date; periodEnd: Date } {
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
    return { periodStart, periodEnd };
  }

  private getRequiredPlan(_featureKey: string, currentPlanKey: string): string {
    // Walk through plans to find which plan enables this feature
    // This is a simplified version — in production you'd cache this
    return currentPlanKey === "FREE" ? "PRO" : currentPlanKey;
  }
}
