// ================================================================
// DowngradeService — Gestion des downgrades de plan
// ================================================================
// Stratégies:
//   graceful  → keep access until current_period_end, then cut
//   immediate → cut immediately on Stripe webhook
//   freeze    → block new actions (consume), keep existing data
// ================================================================

import type { ICacheService } from "./cacheService";
import type { IEntitlementRepository, PlanFeatureRow } from "./entitlementRepository";
import type { DowngradePreview, DowngradePreviewItem, DowngradeStrategy } from "./types";

export class DowngradeService {
  constructor(
    private readonly repo: IEntitlementRepository,
    private readonly cache: ICacheService,
  ) {}

  /**
   * Preview what features will be affected when downgrading from the
   * org's current plan to a target plan.
   */
  async previewDowngrade(orgId: string, targetPlanKey: string): Promise<DowngradePreview> {
    const sub = await this.repo.getActiveSubscription(orgId);
    const fromPlanKey = sub?.plan_key ?? "FREE";

    if (fromPlanKey === targetPlanKey) {
      return {
        fromPlan: fromPlanKey,
        toPlan: targetPlanKey,
        strategy: "immediate",
        affectedFeatures: [],
      };
    }

    const currentFeatures = await this.repo.getPlanFeatures(fromPlanKey);
    const targetFeatures = await this.repo.getPlanFeatures(targetPlanKey);

    const targetMap = new Map(targetFeatures.map((f) => [f.feature_key, f]));

    const affectedFeatures: DowngradePreviewItem[] = [];

    for (const current of currentFeatures) {
      const target = targetMap.get(current.feature_key);

      if (!target) {
        // Feature doesn't exist in target plan = removed
        affectedFeatures.push(this.buildItem(current, false, null, "removed"));
        continue;
      }

      if (!target.enabled) {
        // Feature exists but disabled
        affectedFeatures.push(
          this.buildItem(
            current,
            target.enabled,
            target.limit_value,
            current.enabled ? "removed" : "none",
          ),
        );
        continue;
      }

      // Both enabled — check limit
      if (current.limit_value !== null && target.limit_value !== null) {
        if (target.limit_value < current.limit_value) {
          affectedFeatures.push(this.buildItem(current, true, target.limit_value, "reduced"));
        } else {
          affectedFeatures.push(this.buildItem(current, true, target.limit_value, "none"));
        }
      } else if (current.limit_value === null && target.limit_value !== null) {
        // From unlimited to limited
        affectedFeatures.push(this.buildItem(current, true, target.limit_value, "reduced"));
      } else {
        affectedFeatures.push(this.buildItem(current, target.enabled, target.limit_value, "none"));
      }
    }

    // Determine effective strategy using target plan's feature keys
    const targetKeys = targetFeatures.map((f) => f.feature_key);
    const strategy = this.determineStrategy(currentFeatures, targetKeys);

    return {
      fromPlan: fromPlanKey,
      toPlan: targetPlanKey,
      strategy,
      affectedFeatures,
    };
  }

  /**
   * Execute a downgrade for an organization.
   * Called when Stripe webhook confirms plan change.
   */
  async executeDowngrade(
    orgId: string,
    newPlanKey: string,
    currentPeriodEnd: Date | null,
  ): Promise<void> {
    const sub = await this.repo.getActiveSubscription(orgId);
    const oldPlanKey = sub?.plan_key ?? "FREE";

    const currentFeatures = await this.repo.getPlanFeatures(oldPlanKey);
    const targetFeatures = await this.repo.getPlanFeatures(newPlanKey);

    const targetMap = new Map(targetFeatures.map((f) => [f.feature_key, f]));

    // Create overrides for features that need freezing
    for (const current of currentFeatures) {
      const target = targetMap.get(current.feature_key);
      // Use current feature's downgrade strategy — target may not exist (feature removed)
      // or may have a different strategy than the current plan defines.
      const strategy = current.downgrade_strategy;

      if (strategy === "freeze" && current.enabled && !target?.enabled) {
        // Create a freeze override: feature is still accessible (enabled=true)
        // but consume will be blocked at the service level
        await this.repo.createOverride({
          scope: "org",
          scope_id: orgId,
          feature_key: current.feature_key,
          enabled: true, // Keep access to existing data
          limit_value: 0, // Set limit to 0 so consume fails
          expires_at: currentPeriodEnd,
          reason: `Freeze on downgrade from ${oldPlanKey} to ${newPlanKey}`,
        });
      } else if (strategy === "graceful" && current.enabled && !target?.enabled) {
        // Graceful: keep access until current_period_end
        await this.repo.createOverride({
          scope: "org",
          scope_id: orgId,
          feature_key: current.feature_key,
          enabled: true,
          limit_value: current.limit_value,
          expires_at: currentPeriodEnd,
          reason: `Graceful downgrade from ${oldPlanKey} to ${newPlanKey}, expires at period end`,
        });
      }
    }

    // Invalidate cache
    await this.cache.invalidate(orgId);
  }

  /**
   * Check if a consume operation should be blocked due to a freeze.
   * Returns true if the feature is frozen (can view but not consume).
   */
  async isFrozen(orgId: string, featureKey: string): Promise<boolean> {
    const overrides = await this.repo.getOverrides("org", orgId, featureKey);
    const now = new Date();

    for (const ov of overrides) {
      if (!ov.expires_at || new Date(ov.expires_at) > now) {
        // Frozen = enabled but limit is 0
        if (ov.enabled === true && ov.limit_value === 0) {
          return true;
        }
      }
    }

    return false;
  }

  // ---- Private helpers ----

  private buildItem(
    current: PlanFeatureRow,
    willBeEnabled: boolean,
    newLimit: number | null,
    impact: "none" | "reduced" | "removed",
  ): DowngradePreviewItem {
    return {
      featureKey: current.feature_key,
      featureDescription: current.feature_description ?? current.feature_key,
      currentlyEnabled: current.enabled,
      willBeEnabled,
      currentLimit: current.limit_value,
      newLimit,
      impact,
      strategy: current.downgrade_strategy,
    };
  }

  private determineStrategy(
    currentFeatures: PlanFeatureRow[],
    targetFeatureKeys: string[],
  ): DowngradeStrategy {
    for (const cf of currentFeatures) {
      if (!targetFeatureKeys.includes(cf.feature_key) || !cf.enabled) {
        return cf.downgrade_strategy;
      }
    }
    return "immediate";
  }
}

// Removed: targetFeatureKey was a stub that always returned []. The actual logic
// now computes target keys inline from targetFeatures.map(f => f.feature_key).
