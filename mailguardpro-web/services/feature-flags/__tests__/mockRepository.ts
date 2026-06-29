// ================================================================
// Mock EntitlementRepository for testing
// ================================================================

import type {
  FeatureRow,
  IEntitlementRepository,
  OrganizationRow,
  OverrideRow,
  PlanFeatureRow,
  PlanRow,
  SubscriptionRow,
  UsageRow,
} from "../entitlementRepository";
import type { DowngradeStrategy, FeatureType, OverrideScope, SubscriptionStatus } from "../types";

export class MockEntitlementRepository implements IEntitlementRepository {
  public plans: Map<string, PlanRow> = new Map();
  public features: Map<string, FeatureRow> = new Map();
  public planFeatures: Map<string, PlanFeatureRow[]> = new Map();
  public subscriptions: Map<string, SubscriptionRow> = new Map();
  public overrides: OverrideRow[] = [];
  public usage: UsageRow[] = [];
  public organizations: Map<string, OrganizationRow> = new Map();
  public users: Map<string, string> = new Map(); // userId -> orgId

  private idCounter = 0;

  private nextId(): string {
    this.idCounter++;
    return `mock-${this.idCounter}`;
  }

  // ---- Helpers to seed test data ----

  addPlan(key: string, name: string, priceMonthly = 0, isActive = true): PlanRow {
    const plan: PlanRow = {
      id: this.nextId(),
      key,
      name,
      price_monthly: priceMonthly,
      is_active: isActive,
    };
    this.plans.set(key, plan);
    return plan;
  }

  addFeature(key: string, type: FeatureType = "boolean", description?: string): FeatureRow {
    const feature: FeatureRow = {
      id: this.nextId(),
      key,
      description: description ?? null,
      type,
      default_config: type === "experiment" ? { percentage: 50, seed: `${key}_v1` } : null,
    };
    this.features.set(key, feature);
    return feature;
  }

  addPlanFeature(
    planKey: string,
    featureKey: string,
    enabled: boolean,
    limitValue: number | null = null,
    config: Record<string, unknown> | null = null,
    strategy: DowngradeStrategy = "immediate",
  ): PlanFeatureRow {
    const feature = this.features.get(featureKey);
    const pf: PlanFeatureRow = {
      feature_key: featureKey,
      feature_type: (feature?.type ?? "boolean") as FeatureType,
      feature_description: feature?.description ?? null,
      feature_default_config: feature?.default_config ?? null,
      enabled,
      limit_value: limitValue,
      config_json: config,
      downgrade_strategy: strategy,
    };
    const existing = this.planFeatures.get(planKey) ?? [];
    existing.push(pf);
    this.planFeatures.set(planKey, existing);
    return pf;
  }

  addSubscription(
    orgId: string,
    planKey: string,
    status: SubscriptionStatus = "active",
    stripeSubId?: string,
    periodStart?: Date,
    periodEnd?: Date,
  ): SubscriptionRow {
    const sub: SubscriptionRow = {
      id: this.nextId(),
      org_id: orgId,
      plan_key: planKey,
      status,
      stripe_sub_id: stripeSubId ?? null,
      current_period_start: periodStart ?? null,
      current_period_end: periodEnd ?? null,
    };
    this.subscriptions.set(orgId, sub);
    return sub;
  }

  addOverride(
    scope: OverrideScope,
    scopeId: string,
    featureKey: string,
    enabled: boolean | null = null,
    limitValue: number | null = null,
    expiresAt: Date | null = null,
  ): OverrideRow {
    const ov: OverrideRow = {
      id: this.nextId(),
      scope,
      scope_id: scopeId,
      feature_key: featureKey,
      enabled,
      limit_value: limitValue,
      expires_at: expiresAt,
      reason: "test",
    };
    this.overrides.push(ov);
    return ov;
  }

  addOrg(id: string, name?: string): OrganizationRow {
    const org: OrganizationRow = {
      id,
      name: name ?? `Org ${id}`,
      stripe_customer_id: null,
    };
    this.organizations.set(id, org);
    return org;
  }

  // ---- IEntitlementRepository implementation ----

  async getPlanByKey(planKey: string): Promise<PlanRow | null> {
    return this.plans.get(planKey) ?? null;
  }

  async getFeatureByKey(featureKey: string): Promise<FeatureRow | null> {
    return this.features.get(featureKey) ?? null;
  }

  async getPlanFeatures(planKey: string): Promise<PlanFeatureRow[]> {
    return this.planFeatures.get(planKey) ?? [];
  }

  async getActiveSubscription(orgId: string): Promise<SubscriptionRow | null> {
    const sub = this.subscriptions.get(orgId);
    if (sub && (sub.status === "active" || sub.status === "trialing")) {
      return sub;
    }
    return null;
  }

  async getOverrides(
    scope: OverrideScope,
    scopeId: string,
    featureKey?: string,
  ): Promise<OverrideRow[]> {
    return this.overrides.filter((o) => {
      if (o.scope !== scope) return false;
      if (o.scope_id !== scopeId) return false;
      if (featureKey && o.feature_key !== featureKey) return false;
      return true;
    });
  }

  async createOverride(data: {
    scope: OverrideScope;
    scope_id: string;
    feature_key: string;
    enabled?: boolean | null;
    limit_value?: number | null;
    expires_at?: Date | null;
    reason: string;
  }): Promise<OverrideRow> {
    const ov: OverrideRow = {
      id: this.nextId(),
      scope: data.scope,
      scope_id: data.scope_id,
      feature_key: data.feature_key,
      enabled: data.enabled ?? null,
      limit_value: data.limit_value ?? null,
      expires_at: data.expires_at ?? null,
      reason: data.reason,
    };
    this.overrides.push(ov);
    return ov;
  }

  async deleteOverride(id: string): Promise<void> {
    const idx = this.overrides.findIndex((o) => o.id === id);
    if (idx >= 0) this.overrides.splice(idx, 1);
  }

  async getUsage(
    orgId: string,
    featureKey: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<UsageRow | null> {
    return (
      this.usage.find(
        (u) =>
          u.org_id === orgId &&
          u.feature_key === featureKey &&
          u.period_start.getTime() === periodStart.getTime() &&
          u.period_end.getTime() === periodEnd.getTime(),
      ) ?? null
    );
  }

  async upsertUsage(
    orgId: string,
    featureKey: string,
    periodStart: Date,
    periodEnd: Date,
    incrementBy: number,
  ): Promise<{ usage_count: number; limit_reached: boolean; limit_value: number | null }> {
    const existing = this.usage.find(
      (u) =>
        u.org_id === orgId &&
        u.feature_key === featureKey &&
        u.period_start.getTime() === periodStart.getTime(),
    );

    if (existing) {
      existing.usage_count += incrementBy;
    } else {
      this.usage.push({
        org_id: orgId,
        feature_key: featureKey,
        usage_count: incrementBy,
        period_start: periodStart,
        period_end: periodEnd,
      });
    }

    const current = existing?.usage_count ?? incrementBy;
    const pf = this.planFeatures.get(this.subscriptions.get(orgId)?.plan_key ?? "");
    const limit = pf?.find((f) => f.feature_key === featureKey)?.limit_value ?? null;

    return {
      usage_count: current,
      limit_reached: limit !== null && current > limit,
      limit_value: limit,
    };
  }

  async resetUsage(
    orgId: string,
    featureKey: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    const existing = this.usage.find(
      (u) =>
        u.org_id === orgId &&
        u.feature_key === featureKey &&
        u.period_start.getTime() === periodStart.getTime(),
    );
    if (existing) {
      existing.usage_count = 0;
      existing.period_end = periodEnd;
    } else {
      this.usage.push({
        org_id: orgId,
        feature_key: featureKey,
        usage_count: 0,
        period_start: periodStart,
        period_end: periodEnd,
      });
    }
  }

  async getOrganizationByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<OrganizationRow | null> {
    for (const org of this.organizations.values()) {
      if (org.stripe_customer_id === stripeCustomerId) return org;
    }
    return null;
  }

  async getOrganizationByUserId(userId: string): Promise<OrganizationRow | null> {
    const orgId = this.users.get(userId);
    if (!orgId) return null;
    return this.organizations.get(orgId) ?? null;
  }

  async createOrganization(data: {
    name?: string | null;
    stripe_customer_id?: string | null;
  }): Promise<OrganizationRow> {
    const org: OrganizationRow = {
      id: this.nextId(),
      name: data.name ?? null,
      stripe_customer_id: data.stripe_customer_id ?? null,
    };
    this.organizations.set(org.id, org);
    return org;
  }

  async ensureUserHasOrganization(userId: string): Promise<OrganizationRow> {
    const existing = this.users.get(userId);
    if (existing) {
      return this.organizations.get(existing)!;
    }
    const org = await this.createOrganization({ name: `Org for ${userId}` });
    this.users.set(userId, org.id);
    return org;
  }

  async upsertSubscription(data: {
    org_id: string;
    plan_key: string;
    status: SubscriptionStatus;
    stripe_sub_id?: string | null;
    current_period_start?: Date | null;
    current_period_end?: Date | null;
  }): Promise<SubscriptionRow> {
    const sub: SubscriptionRow = {
      id: this.nextId(),
      org_id: data.org_id,
      plan_key: data.plan_key,
      status: data.status,
      stripe_sub_id: data.stripe_sub_id ?? null,
      current_period_start: data.current_period_start ?? null,
      current_period_end: data.current_period_end ?? null,
    };
    this.subscriptions.set(data.org_id, sub);
    return sub;
  }

  async updateSubscriptionStatus(stripeSubId: string, status: SubscriptionStatus): Promise<void> {
    for (const [key, sub] of this.subscriptions) {
      if (sub.stripe_sub_id === stripeSubId) {
        this.subscriptions.set(key, { ...sub, status });
      }
    }
  }

  async listPlans(
    page: number,
    limit: number,
    sort?: string,
  ): Promise<{ data: PlanRow[]; total: number }> {
    const all = Array.from(this.plans.values());
    return {
      data: all.slice((page - 1) * limit, page * limit),
      total: all.length,
    };
  }

  async listFeatures(
    page: number,
    limit: number,
    sort?: string,
  ): Promise<{ data: FeatureRow[]; total: number }> {
    const all = Array.from(this.features.values());
    return {
      data: all.slice((page - 1) * limit, page * limit),
      total: all.length,
    };
  }

  async getPlanWithFeatures(planKey: string): Promise<{
    plan: PlanRow;
    features: PlanFeatureRow[];
  } | null> {
    const plan = this.plans.get(planKey);
    if (!plan) return null;
    return { plan, features: this.planFeatures.get(planKey) ?? [] };
  }

  async getAllActivePlans(): Promise<PlanRow[]> {
    return Array.from(this.plans.values()).filter((p) => p.is_active);
  }
}
