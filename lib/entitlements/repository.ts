// =====================================================
// ENTITLEMENT REPOSITORY - INTERFACE
// =====================================================

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

// =====================================================
// INTERFACES
// =====================================================

export interface PlanFeature {
  id: string
  planId: string
  featureId: string
  enabled: boolean
  limitValue: number | null
  configJson: ExperimentConfig | null
  downgradeStrategy: DowngradeStrategy
}

export interface Feature {
  id: string
  key: string
  description: string | null
  type: FeatureType
  defaultConfig: ExperimentConfig | null
}

export interface EntitlementOverride {
  id: string
  scope: OverrideScope
  scopeId: string
  featureKey: string
  enabled: boolean
  limitValue: number | null
  expiresAt: Date | null
  reason: string | null
  createdAt: Date
  createdBy: string | null
}

export interface Subscription {
  id: string
  orgId: string
  planKey: string
  status: SubscriptionStatus
  stripeSubscriptionId: string | null
  stripePriceId: string | null
  currentPeriodStart: Date
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
}

export interface UsageTracking {
  id: string
  orgId: string
  featureKey: string
  usageCount: number
  periodStart: Date
  periodEnd: Date
}

export interface Organization {
  id: string
  name: string | null
  stripeCustomerId: string | null
  isPersonal: boolean
}

export interface Plan {
  id: string
  key: string
  name: string
  priceMonthly: number
  isActive: boolean
}

// =====================================================
// REPOSITORY INTERFACE
// =====================================================

export interface IEntitlementRepository {
  // Plans
  getPlan(planKey: string): Promise<Plan | null>
  getAllPlans(): Promise<Plan[]>
  getPlanWithFeatures(planKey: string): Promise<PlanWithFeatures | null>
  updatePlan(planKey: string, data: Partial<Pick<Plan, 'name' | 'priceMonthly' | 'isActive'>>): Promise<Plan>

  // Features
  getFeature(featureKey: string): Promise<Feature | null>
  getAllFeatures(): Promise<FeatureListItem[]>
  createFeature(data: { key: string; description?: string; type: FeatureType; defaultConfig?: ExperimentConfig }): Promise<Feature>
  updateFeature(featureKey: string, data: Partial<Pick<Feature, 'description' | 'defaultConfig'>>): Promise<Feature>

  // Plan Features (assign features to plans)
  getPlanFeatures(planKey: string): Promise<PlanFeature[]>
  setPlanFeature(planKey: string, featureKey: string, data: {
    enabled: boolean
    limitValue?: number | null
    configJson?: ExperimentConfig | null
    downgradeStrategy?: DowngradeStrategy
  }): Promise<PlanFeature>
  deletePlanFeature(planKey: string, featureKey: string): Promise<void>

  // Override (priorité la plus haute)
  getOverride(scope: OverrideScope, scopeId: string, featureKey: string): Promise<EntitlementOverride | null>
  getOverridesForScope(scope: OverrideScope, scopeId: string): Promise<EntitlementOverride[]>
  createOverride(data: {
    scope: OverrideScope
    scopeId: string
    featureKey: string
    enabled: boolean
    limitValue?: number | null
    expiresAt?: Date | null
    reason: string
    createdBy?: string
  }): Promise<EntitlementOverride>
  updateOverride(id: string, data: Partial<Pick<EntitlementOverride, 'enabled' | 'limitValue' | 'expiresAt' | 'reason'>>): Promise<EntitlementOverride>
  deleteOverride(id: string): Promise<void>

  // Subscription
  getActiveSubscription(orgId: string): Promise<Subscription | null>
  getSubscription(orgId: string): Promise<Subscription | null>
  createSubscription(data: {
    orgId: string
    planKey: string
    status: SubscriptionStatus
    stripeSubscriptionId?: string
    stripePriceId?: string
    currentPeriodStart: Date
    currentPeriodEnd: Date
  }): Promise<Subscription>
  updateSubscription(id: string, data: Partial<Omit<Subscription, 'id' | 'orgId'>>): Promise<Subscription>
  cancelSubscription(orgId: string, cancelAtPeriodEnd: boolean): Promise<Subscription>

  // Usage Tracking
  getUsage(orgId: string, featureKey: string, periodStart: Date): Promise<UsageTracking | null>
  getUsageForCurrentPeriod(orgId: string, featureKey: string): Promise<UsageTracking | null>
  createOrUpdateUsage(orgId: string, featureKey: string, periodStart: Date, periodEnd: Date): Promise<UsageTracking>
  incrementUsage(orgId: string, featureKey: string, amount: number): Promise<{ success: boolean; newCount: number; limit: number | null }>

  // Organization
  getOrganization(orgId: string): Promise<Organization | null>
  getOrganizationByStripeCustomerId(stripeCustomerId: string): Promise<Organization | null>
  createOrganization(data: { name?: string; stripeCustomerId?: string; isPersonal?: boolean }): Promise<Organization>
  updateOrganization(orgId: string, data: Partial<Pick<Organization, 'name' | 'stripeCustomerId'>>): Promise<Organization>

  // Webhook Event (idempotency)
  isWebhookEventProcessed(eventId: string): Promise<boolean>
  markWebhookEventProcessed(eventId: string, orgId?: string): Promise<void>

  // Admin: Downgrade Preview
  getDowngradePreview(orgId: string, targetPlanKey: string): Promise<DowngradePreview[]>
}