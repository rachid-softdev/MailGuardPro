// =====================================================
// ENTITLEMENT REPOSITORY - PRISMA IMPLEMENTATION
// =====================================================

import { prisma } from '@/lib/prisma'
import type { IEntitlementRepository } from './repository'
import type {
  FeatureType,
  OverrideScope,
  SubscriptionStatus,
  DowngradeStrategy,
  ExperimentConfig,
  PlanWithFeatures,
  FeatureListItem,
  DowngradePreview,
} from './types'
import { SUBSCRIPTION_ACTIVE_STATUSES } from './types'

export class PrismaEntitlementRepository implements IEntitlementRepository {
  // =====================================================
  // PLANS
  // =====================================================

  async getPlan(planKey: string) {
    return prisma.plan.findUnique({
      where: { key: planKey },
    })
  }

  async getAllPlans() {
    return prisma.plan.findMany({
      orderBy: { priceMonthly: 'asc' },
    })
  }

  async getPlanWithFeatures(planKey: string): Promise<PlanWithFeatures | null> {
    const plan = await prisma.plan.findUnique({
      where: { key: planKey },
      include: {
        features: {
          include: {
            feature: true,
          },
        },
      },
    })

    if (!plan) return null

    return {
      id: plan.id,
      key: plan.key,
      name: plan.name,
      priceMonthly: plan.priceMonthly,
      isActive: plan.isActive,
      features: plan.features.map((pf) => ({
        key: pf.feature.key,
        description: pf.feature.description,
        type: pf.feature.type as FeatureType,
        enabled: pf.enabled,
        limitValue: pf.limitValue,
        configJson: pf.configJson as ExperimentConfig | null,
        downgradeStrategy: pf.downgradeStrategy as DowngradeStrategy,
      })),
    }
  }

  async updatePlan(planKey: string, data: Partial<{ name: string; priceMonthly: number; isActive: boolean }>) {
    return prisma.plan.update({
      where: { key: planKey },
      data,
    })
  }

  // =====================================================
  // FEATURES
  // =====================================================

  async getFeature(featureKey: string) {
    return prisma.feature.findUnique({
      where: { key: featureKey },
    })
  }

  async getAllFeatures(): Promise<FeatureListItem[]> {
    const features = await prisma.feature.findMany({
      orderBy: { key: 'asc' },
    })
    return features.map((f) => ({
      ...f,
      type: f.type as FeatureType,
      defaultConfig: f.defaultConfig as ExperimentConfig | null,
    }))
  }

  async createFeature(data: { key: string; description?: string; type: FeatureType; defaultConfig?: ExperimentConfig }) {
    return prisma.feature.create({
      data: {
        key: data.key,
        description: data.description,
        type: data.type,
        defaultConfig: data.defaultConfig ?? undefined,
      },
    })
  }

  async updateFeature(featureKey: string, data: Partial<{ description: string; defaultConfig: ExperimentConfig }>) {
    return prisma.feature.update({
      where: { key: featureKey },
      data: {
        description: data.description,
        defaultConfig: data.defaultConfig as any,
      },
    })
  }

  // =====================================================
  // PLAN FEATURES
  // =====================================================

  async getPlanFeatures(planKey: string) {
    const plan = await prisma.plan.findUnique({
      where: { key: planKey },
      include: {
        features: true,
      },
    })
    return plan?.features ?? []
  }

  async setPlanFeature(planKey: string, featureKey: string, data: {
    enabled: boolean
    limitValue?: number | null
    configJson?: ExperimentConfig | null
    downgradeStrategy?: DowngradeStrategy
  }) {
    const plan = await prisma.plan.findUnique({ where: { key: planKey } })
    const feature = await prisma.feature.findUnique({ where: { key: featureKey } })

    if (!plan || !feature) {
      throw new Error(`Plan or Feature not found: ${planKey} / ${featureKey}`)
    }

    return prisma.planFeature.upsert({
      where: {
        planId_featureId: {
          planId: plan.id,
          featureId: feature.id,
        },
      },
      create: {
        planId: plan.id,
        featureId: feature.id,
        enabled: data.enabled,
        limitValue: data.limitValue ?? null,
        configJson: data.configJson as any,
        downgradeStrategy: data.downgradeStrategy ?? 'GRACEFUL',
      },
      update: {
        enabled: data.enabled,
        limitValue: data.limitValue ?? null,
        configJson: data.configJson as any,
        downgradeStrategy: data.downgradeStrategy ?? 'GRACEFUL',
      },
    })
  }

  async deletePlanFeature(planKey: string, featureKey: string) {
    const plan = await prisma.plan.findUnique({ where: { key: planKey } })
    const feature = await prisma.feature.findUnique({ where: { key: featureKey } })

    if (!plan || !feature) return

    await prisma.planFeature.deleteMany({
      where: {
        planId: plan.id,
        featureId: feature.id,
      },
    })
  }

  // =====================================================
  // OVERRIDES
  // =====================================================

  async getOverride(scope: OverrideScope, scopeId: string, featureKey: string) {
    // Check if not expired
    const now = new Date()
    return prisma.entitlementOverride.findFirst({
      where: {
        scope,
        scopeId,
        featureKey,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getOverridesForScope(scope: OverrideScope, scopeId: string) {
    return prisma.entitlementOverride.findMany({
      where: {
        scope,
        scopeId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    })
  }

  async createOverride(data: {
    scope: OverrideScope
    scopeId: string
    featureKey: string
    enabled: boolean
    limitValue?: number | null
    expiresAt?: Date | null
    reason: string
    createdBy?: string
  }) {
    return prisma.entitlementOverride.create({
      data: {
        scope: data.scope,
        scopeId: data.scopeId,
        featureKey: data.featureKey,
        enabled: data.enabled,
        limitValue: data.limitValue ?? null,
        expiresAt: data.expiresAt ?? null,
        reason: data.reason,
        createdBy: data.createdBy ?? null,
      },
    })
  }

  async updateOverride(id: string, data: Partial<{ enabled: boolean; limitValue: number | null; expiresAt: Date | null; reason: string }>) {
    return prisma.entitlementOverride.update({
      where: { id },
      data: {
        enabled: data.enabled,
        limitValue: data.limitValue,
        expiresAt: data.expiresAt,
        reason: data.reason,
      },
    })
  }

  async deleteOverride(id: string) {
    await prisma.entitlementOverride.delete({
      where: { id },
    })
  }

  // =====================================================
  // SUBSCRIPTIONS
  // =====================================================

  async getActiveSubscription(orgId: string) {
    return prisma.subscription.findFirst({
      where: {
        orgId,
        status: { in: SUBSCRIPTION_ACTIVE_STATUSES },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getSubscription(orgId: string) {
    return prisma.subscription.findFirst({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async createSubscription(data: {
    orgId: string
    planKey: string
    status: SubscriptionStatus
    stripeSubscriptionId?: string
    stripePriceId?: string
    currentPeriodStart: Date
    currentPeriodEnd: Date
  }) {
    return prisma.subscription.create({
      data: {
        orgId: data.orgId,
        planKey: data.planKey,
        status: data.status,
        stripeSubscriptionId: data.stripeSubscriptionId ?? null,
        stripePriceId: data.stripePriceId ?? null,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
      },
    })
  }

  async updateSubscription(id: string, data: Partial<Omit<{
    orgId: string
    planKey: string
    status: SubscriptionStatus
    stripeSubscriptionId: string | null
    stripePriceId: string | null
    currentPeriodStart: Date
    currentPeriodEnd: Date
    cancelAtPeriodEnd: boolean
  }, 'id' | 'orgId'>>) {
    return prisma.subscription.update({
      where: { id },
      data: {
        planKey: data.planKey,
        status: data.status,
        stripeSubscriptionId: data.stripeSubscriptionId,
        stripePriceId: data.stripePriceId,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
      },
    })
  }

  async cancelSubscription(orgId: string, cancelAtPeriodEnd: boolean) {
    const sub = await this.getActiveSubscription(orgId)
    if (!sub) throw new Error('No active subscription found')

    return prisma.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd },
    })
  }

  // =====================================================
  // USAGE TRACKING
  // =====================================================

  async getUsage(orgId: string, featureKey: string, periodStart: Date) {
    return prisma.usageTracking.findUnique({
      where: {
        orgId_featureKey_periodStart: {
          orgId,
          featureKey,
          periodStart,
        },
      },
    })
  }

  async getUsageForCurrentPeriod(orgId: string, featureKey: string): Promise<{ usageCount: number; periodStart: Date; periodEnd: Date } | null> {
    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    const usage = await prisma.usageTracking.findFirst({
      where: {
        orgId,
        featureKey,
        periodEnd: { gte: now },
      },
      orderBy: { periodStart: 'desc' },
    })

    if (!usage) return null

    return {
      usageCount: usage.usageCount,
      periodStart: usage.periodStart,
      periodEnd: usage.periodEnd,
    }
  }

  async createOrUpdateUsage(orgId: string, featureKey: string, periodStart: Date, periodEnd: Date) {
    return prisma.usageTracking.upsert({
      where: {
        orgId_featureKey_periodStart: {
          orgId,
          featureKey,
          periodStart,
        },
      },
      create: {
        orgId,
        featureKey,
        usageCount: 0,
        periodStart,
        periodEnd,
      },
      update: {},
    })
  }

  async incrementUsage(orgId: string, featureKey: string, amount: number): Promise<{ success: boolean; newCount: number; limit: number | null }> {
    // First, get the current period's limit
    const subscription = await this.getActiveSubscription(orgId)
    if (!subscription) {
      return { success: false, newCount: 0, limit: null }
    }

    const planFeatures = await prisma.planFeature.findMany({
      where: {
        plan: { key: subscription.planKey },
        feature: { key: featureKey },
      },
      include: { feature: true },
    })

    const planFeature = planFeatures[0]
    const limit = planFeature?.limitValue ?? null

    // Atomic increment with limit check
    // If limit is null (unlimited), allow any increment
    if (limit !== null) {
      const result = await prisma.$executeRaw`
        UPDATE "UsageTracking"
        SET "usageCount" = "usageCount" + ${amount},
            "updatedAt" = NOW()
        WHERE "orgId" = ${orgId}
          AND "featureKey" = ${featureKey}
          AND "periodEnd" > NOW()
          AND "usageCount" + ${amount} <= ${limit}
        RETURNING "usageCount"
      `

      // If no rows updated, limit would be exceeded - try to get current count
      if (result.length === 0) {
        const current = await this.getUsageForCurrentPeriod(orgId, featureKey)
        return {
          success: false,
          newCount: current?.usageCount ?? 0,
          limit,
        }
      }

      return {
        success: true,
        newCount: result[0].usageCount,
        limit,
      }
    } else {
      // Unlimited - just increment
      const now = new Date()
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

      // Ensure row exists
      await this.createOrUpdateUsage(orgId, featureKey, periodStart, periodEnd)

      const result = await prisma.$executeRaw`
        UPDATE "UsageTracking"
        SET "usageCount" = "usageCount" + ${amount},
            "updatedAt" = NOW()
        WHERE "orgId" = ${orgId}
          AND "featureKey" = ${featureKey}
          AND "periodEnd" > NOW()
        RETURNING "usageCount"
      `

      return {
        success: true,
        newCount: result[0]?.usageCount ?? amount,
        limit: null,
      }
    }
  }

  // =====================================================
  // ORGANIZATIONS
  // =====================================================

  async getOrganization(orgId: string) {
    return prisma.organization.findUnique({
      where: { id: orgId },
    })
  }

  async getOrganizationByStripeCustomerId(stripeCustomerId: string) {
    return prisma.organization.findUnique({
      where: { stripeCustomerId },
    })
  }

  async createOrganization(data: { name?: string; stripeCustomerId?: string; isPersonal?: boolean }) {
    return prisma.organization.create({
      data: {
        name: data.name,
        stripeCustomerId: data.stripeCustomerId,
        isPersonal: data.isPersonal ?? true,
      },
    })
  }

  async updateOrganization(orgId: string, data: Partial<{ name: string; stripeCustomerId: string }>) {
    return prisma.organization.update({
      where: { id: orgId },
      data,
    })
  }

  // =====================================================
  // WEBHOOK EVENTS (IDEMPOTENCY)
  // =====================================================

  async isWebhookEventProcessed(eventId: string): Promise<boolean> {
    const event = await prisma.webhookEvent.findUnique({
      where: { id: eventId },
    })
    return event !== null
  }

  async markWebhookEventProcessed(eventId: string, orgId?: string) {
    await prisma.webhookEvent.upsert({
      where: { id: eventId },
      create: {
        id: eventId,
        orgId: orgId ?? null,
      },
      update: {},
    })
  }

  // =====================================================
  // ADMIN: DOWNGRADE PREVIEW
  // =====================================================

  async getDowngradePreview(orgId: string, targetPlanKey: string): Promise<DowngradePreview[]> {
    const currentSub = await this.getActiveSubscription(orgId)
    if (!currentSub) {
      throw new Error('No active subscription')
    }

    // Get all features
    const allFeatures = await this.getAllFeatures()
    
    // Get current plan features
    const currentPlanFeatures = await this.getPlanFeatures(currentSub.planKey)
    
    // Get target plan features
    const targetPlanFeatures = await this.getPlanFeatures(targetPlanKey)

    const previews: DowngradePreview[] = []

    for (const feature of allFeatures) {
      const currentPF = currentPlanFeatures.find(pf => pf.featureId === feature.id)
      const targetPF = targetPlanFeatures.find(pf => pf.featureId === feature.id)

      const currentValue = currentPF?.enabled ?? false
      const currentLimit = currentPF?.limitValue ?? null
      const newValue = targetPF?.enabled ?? false
      const newLimit = targetPF?.limitValue ?? null

      const willBeAffected = (currentValue && !newValue) || 
        (currentLimit !== null && newLimit === null) ||
        (currentLimit !== null && newLimit !== null && currentLimit > newLimit)

      previews.push({
        featureKey: feature.key,
        currentValue: feature.type === 'LIMIT' ? currentLimit : currentValue,
        newValue: feature.type === 'LIMIT' ? newLimit : newValue,
        downgradeStrategy: targetPF?.downgradeStrategy ?? 'GRACEFUL',
        willBeAffected,
      })
    }

    return previews
  }
}

// Export singleton instance
export const entitlementRepository = new PrismaEntitlementRepository()