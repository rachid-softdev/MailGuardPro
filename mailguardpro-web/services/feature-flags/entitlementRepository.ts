// ================================================================
// EntitlementRepository — Interface + Prisma Implementation
// ================================================================
// This repository is the ONLY data access layer for entitlements.
// FeatureGateService receives it via dependency injection.
// No Prisma/Redis calls in the service layer.
// ================================================================

import type { DowngradeStrategy, FeatureType, OverrideScope, SubscriptionStatus } from "./types";

// ---- Row types returned by the repository ----
// These mirror the Prisma shape so the service never imports Prisma.

export interface PlanRow {
  id: string;
  key: string;
  name: string;
  price_monthly: number;
  is_active: boolean;
}

export interface FeatureRow {
  id: string;
  key: string;
  description: string | null;
  type: FeatureType;
  default_config: Record<string, unknown> | null;
}

export interface PlanFeatureRow {
  feature_key: string;
  feature_type: FeatureType;
  feature_description: string | null;
  feature_default_config: Record<string, unknown> | null;
  enabled: boolean;
  limit_value: number | null;
  config_json: Record<string, unknown> | null;
  downgrade_strategy: DowngradeStrategy;
}

export interface SubscriptionRow {
  id: string;
  org_id: string;
  plan_key: string;
  status: SubscriptionStatus;
  stripe_sub_id: string | null;
  current_period_start: Date | null;
  current_period_end: Date | null;
}

export interface OverrideRow {
  id: string;
  scope: OverrideScope;
  scope_id: string;
  feature_key: string;
  enabled: boolean | null;
  limit_value: number | null;
  expires_at: Date | null;
  reason: string;
}

export interface UsageRow {
  org_id: string;
  feature_key: string;
  usage_count: number;
  period_start: Date;
  period_end: Date;
}

export interface OrganizationRow {
  id: string;
  name: string | null;
  stripe_customer_id: string | null;
}

// ---- Repository Interface ----
// Can be mocked for testing without any database.

export interface IEntitlementRepository {
  // Plan & Feature queries
  getPlanByKey(planKey: string): Promise<PlanRow | null>;
  getFeatureByKey(featureKey: string): Promise<FeatureRow | null>;
  getPlanFeatures(planKey: string): Promise<PlanFeatureRow[]>;

  // Subscription queries
  getActiveSubscription(orgId: string): Promise<SubscriptionRow | null>;

  // Override queries
  getOverrides(scope: OverrideScope, scopeId: string, featureKey?: string): Promise<OverrideRow[]>;
  createOverride(data: {
    scope: OverrideScope;
    scope_id: string;
    feature_key: string;
    enabled?: boolean | null;
    limit_value?: number | null;
    expires_at?: Date | null;
    reason: string;
  }): Promise<OverrideRow>;
  deleteOverride(id: string): Promise<void>;

  // Usage tracking
  getUsage(
    orgId: string,
    featureKey: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<UsageRow | null>;
  upsertUsage(
    orgId: string,
    featureKey: string,
    periodStart: Date,
    periodEnd: Date,
    incrementBy: number,
  ): Promise<{ usage_count: number; limit_reached: boolean; limit_value: number | null }>;
  resetUsage(orgId: string, featureKey: string, periodStart: Date, periodEnd: Date): Promise<void>;

  // Organization queries
  getOrganizationByStripeCustomerId(stripeCustomerId: string): Promise<OrganizationRow | null>;
  getOrganizationByUserId(userId: string): Promise<OrganizationRow | null>;
  createOrganization(data: {
    name?: string | null;
    stripe_customer_id?: string | null;
  }): Promise<OrganizationRow>;
  ensureUserHasOrganization(userId: string): Promise<OrganizationRow>;

  // Subscription mutations
  upsertSubscription(data: {
    org_id: string;
    plan_key: string;
    status: SubscriptionStatus;
    stripe_sub_id?: string | null;
    current_period_start?: Date | null;
    current_period_end?: Date | null;
  }): Promise<SubscriptionRow>;
  updateSubscriptionStatus(stripeSubId: string, status: SubscriptionStatus): Promise<void>;

  // Admin queries (paginated)
  listPlans(
    page: number,
    limit: number,
    sort?: string,
  ): Promise<{ data: PlanRow[]; total: number }>;
  listFeatures(
    page: number,
    limit: number,
    sort?: string,
  ): Promise<{ data: FeatureRow[]; total: number }>;
  getPlanWithFeatures(planKey: string): Promise<{
    plan: PlanRow;
    features: PlanFeatureRow[];
  } | null>;

  // All plans (for lookup)
  getAllActivePlans(): Promise<PlanRow[]>;
}

// ---- Prisma Implementation ----

export class PrismaEntitlementRepository implements IEntitlementRepository {
  constructor(private readonly prisma: any) {}

  async getPlanByKey(planKey: string): Promise<PlanRow | null> {
    const plan = await this.prisma.pricingPlan.findUnique({
      where: { key: planKey },
    });
    if (!plan) return null;
    return {
      id: plan.id,
      key: plan.key,
      name: plan.name,
      price_monthly: plan.priceMonthly,
      is_active: plan.isActive,
    };
  }

  async getFeatureByKey(featureKey: string): Promise<FeatureRow | null> {
    const feature = await this.prisma.feature.findUnique({
      where: { key: featureKey },
    });
    if (!feature) return null;
    return {
      id: feature.id,
      key: feature.key,
      description: feature.description,
      type: feature.type as FeatureType,
      default_config: feature.defaultConfig as Record<string, unknown> | null,
    };
  }

  async getPlanFeatures(planKey: string): Promise<PlanFeatureRow[]> {
    const rows = await this.prisma.planFeature.findMany({
      where: { plan: { key: planKey } },
      include: { feature: true },
    });
    return (rows as any[]).map((r) => ({
      feature_key: r.feature.key,
      feature_type: r.feature.type as FeatureType,
      feature_description: r.feature.description,
      feature_default_config: r.feature.defaultConfig as Record<string, unknown> | null,
      enabled: r.enabled,
      limit_value: r.limitValue,
      config_json: r.configJson as Record<string, unknown> | null,
      downgrade_strategy: r.downgradeStrategy as DowngradeStrategy,
    }));
  }

  async getActiveSubscription(orgId: string): Promise<SubscriptionRow | null> {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        orgId,
        status: { in: ["ACTIVE", "TRIALING"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!sub) return null;
    return {
      id: sub.id,
      org_id: sub.orgId,
      plan_key: sub.planKey,
      status: sub.status as SubscriptionStatus,
      stripe_sub_id: sub.stripeSubId,
      current_period_start: sub.currentPeriodStart,
      current_period_end: sub.currentPeriodEnd,
    };
  }

  async getOverrides(
    scope: OverrideScope,
    scopeId: string,
    featureKey?: string,
  ): Promise<OverrideRow[]> {
    const where: Record<string, unknown> = {
      scope: scope === "org" ? "ORG" : "USER",
      scopeId,
    };
    if (featureKey) {
      where.featureKey = featureKey;
    }
    const rows = await this.prisma.entitlementOverride.findMany({ where });
    return (rows as any[]).map((r) => ({
      id: r.id,
      scope: r.scope === "ORG" ? "org" : ("user" as OverrideScope),
      scope_id: r.scopeId,
      feature_key: r.featureKey,
      enabled: r.enabled,
      limit_value: r.limitValue,
      expires_at: r.expiresAt,
      reason: r.reason,
    }));
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
    const row = await this.prisma.entitlementOverride.create({
      data: {
        scope: data.scope === "org" ? "ORG" : "USER",
        scopeId: data.scope_id,
        featureKey: data.feature_key,
        enabled: data.enabled ?? null,
        limitValue: data.limit_value ?? null,
        expiresAt: data.expires_at ?? null,
        reason: data.reason,
      },
    });
    return {
      id: row.id,
      scope: row.scope === "ORG" ? "org" : ("user" as OverrideScope),
      scope_id: row.scopeId,
      feature_key: row.featureKey,
      enabled: row.enabled,
      limit_value: row.limitValue,
      expires_at: row.expiresAt,
      reason: row.reason,
    };
  }

  async deleteOverride(id: string): Promise<void> {
    await this.prisma.entitlementOverride.delete({ where: { id } });
  }

  async getUsage(
    orgId: string,
    featureKey: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<UsageRow | null> {
    const row = await this.prisma.usageTracking.findFirst({
      where: {
        orgId,
        featureKey,
        periodStart,
        periodEnd,
      },
    });
    if (!row) return null;
    return {
      org_id: row.orgId,
      feature_key: row.featureKey,
      usage_count: row.usageCount,
      period_start: row.periodStart,
      period_end: row.periodEnd,
    };
  }

  async upsertUsage(
    orgId: string,
    featureKey: string,
    periodStart: Date,
    periodEnd: Date,
    incrementBy: number,
  ): Promise<{ usage_count: number; limit_reached: boolean; limit_value: number | null }> {
    // Get the feature limit for this org
    const planFeature = await this.getPlanFeatureInfo(orgId, featureKey);
    const limitValue = planFeature?.limit_value ?? null;

    // Atomic upsert + increment using raw SQL for the Postgres adapter
    // This avoids race conditions in a single query
    const result = await this.prisma.$queryRaw<Array<{ usage_count: bigint }>>`
      INSERT INTO usage_tracking (id, org_id, feature_key, usage_count, period_start, period_end)
      VALUES (gen_random_uuid(), ${orgId}, ${featureKey}, ${incrementBy}, ${periodStart}, ${periodEnd})
      ON CONFLICT (org_id, feature_key, period_start)
      DO UPDATE SET usage_count = usage_tracking.usage_count + ${incrementBy}
      RETURNING usage_count
    `;

    const usageCount = Number(result[0]?.usage_count ?? 0);
    const limitReached = limitValue !== null && usageCount > limitValue;

    return {
      usage_count: usageCount,
      limit_reached: limitReached,
      limit_value: limitValue,
    };
  }

  async resetUsage(
    orgId: string,
    featureKey: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    await this.prisma.usageTracking.upsert({
      where: {
        orgId_featureKey_periodStart: {
          orgId,
          featureKey,
          periodStart,
        },
      },
      update: { usageCount: 0, periodEnd },
      create: {
        orgId,
        featureKey,
        usageCount: 0,
        periodStart,
        periodEnd,
      },
    });
  }

  async getOrganizationByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<OrganizationRow | null> {
    const org = await this.prisma.organization.findUnique({
      where: { stripeCustomerId },
    });
    if (!org) return null;
    return {
      id: org.id,
      name: org.name,
      stripe_customer_id: org.stripeCustomerId,
    };
  }

  async getOrganizationByUserId(userId: string): Promise<OrganizationRow | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    if (!user?.organization) return null;
    return {
      id: user.organization.id,
      name: user.organization.name,
      stripe_customer_id: user.organization.stripeCustomerId,
    };
  }

  async createOrganization(data: {
    name?: string | null;
    stripe_customer_id?: string | null;
  }): Promise<OrganizationRow> {
    const org = await this.prisma.organization.create({
      data: {
        name: data.name ?? null,
        stripeCustomerId: data.stripe_customer_id ?? null,
      },
    });
    return {
      id: org.id,
      name: org.name,
      stripe_customer_id: org.stripeCustomerId,
    };
  }

  async ensureUserHasOrganization(userId: string): Promise<OrganizationRow> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    if (!user) throw new Error(`User ${userId} not found`);
    if (user.organization) {
      return {
        id: user.organization.id,
        name: user.organization.name,
        stripe_customer_id: user.organization.stripeCustomerId,
      };
    }
    // Create organization and link user
    const org = await this.prisma.organization.create({
      data: {
        name: `${user.name ?? user.email ?? "Org"}'s Organization`,
      },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { organizationId: org.id },
    });
    return {
      id: org.id,
      name: org.name,
      stripe_customer_id: org.stripeCustomerId,
    };
  }

  async upsertSubscription(data: {
    org_id: string;
    plan_key: string;
    status: SubscriptionStatus;
    stripe_sub_id?: string | null;
    current_period_start?: Date | null;
    current_period_end?: Date | null;
  }): Promise<SubscriptionRow> {
    const status = data.status.toUpperCase() as
      | "ACTIVE"
      | "TRIALING"
      | "PAST_DUE"
      | "CANCELED"
      | "INCOMPLETE"
      | "INCOMPLETE_EXPIRED";

    // Use raw upsert since Prisma doesn't support upsert with unique composite keys
    // that differ from the @id
    const result = await this.prisma.$queryRaw<
      Array<{
        id: string;
        org_id: string;
        plan_key: string;
        status: string;
        stripe_sub_id: string | null;
        current_period_start: Date | null;
        current_period_end: Date | null;
      }>
    >`
      INSERT INTO subscriptions (id, org_id, plan_key, status, stripe_sub_id, current_period_start, current_period_end)
      VALUES (gen_random_uuid(), ${data.org_id}, ${data.plan_key}, ${status}, ${data.stripe_sub_id ?? null}, ${data.current_period_start ?? null}, ${data.current_period_end ?? null})
      ON CONFLICT (org_id, plan_key)
      DO UPDATE SET
        status = EXCLUDED.status,
        stripe_sub_id = COALESCE(EXCLUDED.stripe_sub_id, subscriptions.stripe_sub_id),
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        updated_at = NOW()
      RETURNING id, org_id, plan_key, status, stripe_sub_id, current_period_start, current_period_end
    `;

    const row = result[0];
    return {
      id: row.id,
      org_id: row.org_id,
      plan_key: row.plan_key,
      status: row.status as SubscriptionStatus,
      stripe_sub_id: row.stripe_sub_id,
      current_period_start: row.current_period_start,
      current_period_end: row.current_period_end,
    };
  }

  async updateSubscriptionStatus(stripeSubId: string, status: SubscriptionStatus): Promise<void> {
    const dbStatus = status.toUpperCase() as
      | "ACTIVE"
      | "TRIALING"
      | "PAST_DUE"
      | "CANCELED"
      | "INCOMPLETE"
      | "INCOMPLETE_EXPIRED";

    await this.prisma.subscription.updateMany({
      where: { stripeSubId },
      data: { status: dbStatus },
    });
  }

  async listPlans(
    page: number,
    limit: number,
    sort?: string,
  ): Promise<{ data: PlanRow[]; total: number }> {
    const [sortField, sortDir] = sort ? sort.split(":") : ["key", "asc"];
    const orderBy: Record<string, string> = {
      [sortField || "key"]: sortDir === "desc" ? "desc" : "asc",
    };

    const [rows, total] = await Promise.all([
      this.prisma.pricingPlan.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
      }),
      this.prisma.pricingPlan.count(),
    ]);

    return {
      data: (rows as any[]).map((p) => ({
        id: p.id,
        key: p.key,
        name: p.name,
        price_monthly: p.priceMonthly,
        is_active: p.isActive,
      })),
      total,
    };
  }

  async listFeatures(
    page: number,
    limit: number,
    sort?: string,
  ): Promise<{ data: FeatureRow[]; total: number }> {
    const [sortField, sortDir] = sort ? sort.split(":") : ["key", "asc"];
    const orderBy: Record<string, string> = {
      [sortField || "key"]: sortDir === "desc" ? "desc" : "asc",
    };

    const [rows, total] = await Promise.all([
      this.prisma.feature.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
      }),
      this.prisma.feature.count(),
    ]);

    return {
      data: (rows as any[]).map((f) => ({
        id: f.id,
        key: f.key,
        description: f.description,
        type: f.type as FeatureType,
        default_config: f.defaultConfig as Record<string, unknown> | null,
      })),
      total,
    };
  }

  async getPlanWithFeatures(planKey: string): Promise<{
    plan: PlanRow;
    features: PlanFeatureRow[];
  } | null> {
    const plan = await this.prisma.pricingPlan.findUnique({
      where: { key: planKey },
    });
    if (!plan) return null;

    const features = await this.getPlanFeatures(planKey);
    return {
      plan: {
        id: plan.id,
        key: plan.key,
        name: plan.name,
        price_monthly: plan.priceMonthly,
        is_active: plan.isActive,
      },
      features,
    };
  }

  async getAllActivePlans(): Promise<PlanRow[]> {
    const rows = await this.prisma.pricingPlan.findMany({
      where: { isActive: true },
    });
    return (rows as any[]).map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      price_monthly: p.priceMonthly,
      is_active: p.isActive,
    }));
  }

  // ---- Private helpers ----

  private async getPlanFeatureInfo(
    orgId: string,
    featureKey: string,
  ): Promise<{ limit_value: number | null } | null> {
    const sub = await this.getActiveSubscription(orgId);
    if (!sub) return null;

    const planFeatures = await this.getPlanFeatures(sub.plan_key);
    const pf = planFeatures.find((f) => f.feature_key === featureKey);
    if (!pf) return null;

    return { limit_value: pf.limit_value };
  }
}
