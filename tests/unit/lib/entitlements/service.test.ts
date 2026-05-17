// =====================================================
// TESTS - FEATURE GATE SERVICE
// =====================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FeatureGateService } from '@/lib/entitlements/service'
import type { IEntitlementRepository } from '@/lib/entitlements/repository'
import type { Feature, PlanFeature, EntitlementOverride, Subscription, UsageTracking, Organization } from '@/lib/entitlements/repository'

// =====================================================
// MOCK REPOSITORY
// =====================================================

const createMockRepo = (): IEntitlementRepository => ({
  getPlan: vi.fn(),
  getAllPlans: vi.fn(),
  getPlanWithFeatures: vi.fn(),
  updatePlan: vi.fn(),
  getFeature: vi.fn(),
  getAllFeatures: vi.fn(),
  createFeature: vi.fn(),
  updateFeature: vi.fn(),
  getPlanFeatures: vi.fn(),
  setPlanFeature: vi.fn(),
  deletePlanFeature: vi.fn(),
  getOverride: vi.fn(),
  getOverridesForScope: vi.fn(),
  createOverride: vi.fn(),
  updateOverride: vi.fn(),
  deleteOverride: vi.fn(),
  getActiveSubscription: vi.fn(),
  getSubscription: vi.fn(),
  createSubscription: vi.fn(),
  updateSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  getUsage: vi.fn(),
  getUsageForCurrentPeriod: vi.fn(),
  createOrUpdateUsage: vi.fn(),
  incrementUsage: vi.fn(),
  getOrganization: vi.fn(),
  getOrganizationByStripeCustomerId: vi.fn(),
  createOrganization: vi.fn(),
  updateOrganization: vi.fn(),
  isWebhookEventProcessed: vi.fn(),
  markWebhookEventProcessed: vi.fn(),
  getDowngradePreview: vi.fn(),
})

// Mock cache
const mockCache = {
  get: vi.fn(),
  set: vi.fn(),
  invalidate: vi.fn(),
  publishInvalidation: vi.fn(),
}

// =====================================================
// TEST SUITE
// =====================================================

describe('FeatureGateService', () => {
  let service: FeatureGateService
  let mockRepo: IEntitlementRepository

  beforeEach(() => {
    mockRepo = createMockRepo()
    service = new FeatureGateService(mockRepo as any, mockCache as any)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // =====================================================
  // HAS FEATURE TESTS
  // =====================================================

  describe('hasFeature', () => {
    it('should return true when feature is enabled via plan', async () => {
      // Setup
      const mockFeature: Feature = { id: 'f1', key: 'EXPORT_PDF', description: '', type: 'BOOLEAN', defaultConfig: null }
      const mockPlanFeature: PlanFeature = { id: 'pf1', planId: 'p1', featureId: 'f1', enabled: true, limitValue: null, configJson: null, downgradeStrategy: 'GRACEFUL' }
      const mockSubscription: Subscription = { id: 's1', orgId: 'org1', planKey: 'pro', status: 'ACTIVE', stripeSubscriptionId: null, stripePriceId: null, currentPeriodStart: new Date(), currentPeriodEnd: new Date(), cancelAtPeriodEnd: false }
      
      ;(mockRepo.getOverride as any).mockResolvedValue(null)
      ;(mockRepo.getActiveSubscription as any).mockResolvedValue(mockSubscription)
      ;(mockRepo.getPlanFeatures as any).mockResolvedValue([mockPlanFeature])
      ;(mockRepo.getFeature as any).mockResolvedValue(mockFeature)

      // Execute
      const result = await service.hasFeature('org1', 'EXPORT_PDF')

      // Assert
      expect(result).toBe(true)
    })

    it('should return false when feature is disabled via plan', async () => {
      const mockFeature: Feature = { id: 'f1', key: 'EXPORT_PDF', description: '', type: 'BOOLEAN', defaultConfig: null }
      const mockPlanFeature: PlanFeature = { id: 'pf1', planId: 'p1', featureId: 'f1', enabled: false, limitValue: null, configJson: null, downgradeStrategy: 'GRACEFUL' }
      const mockSubscription: Subscription = { id: 's1', orgId: 'org1', planKey: 'free', status: 'ACTIVE', stripeSubscriptionId: null, stripePriceId: null, currentPeriodStart: new Date(), currentPeriodEnd: new Date(), cancelAtPeriodEnd: false }
      
      ;(mockRepo.getOverride as any).mockResolvedValue(null)
      ;(mockRepo.getActiveSubscription as any).mockResolvedValue(mockSubscription)
      ;(mockRepo.getPlanFeatures as any).mockResolvedValue([mockPlanFeature])
      ;(mockRepo.getFeature as any).mockResolvedValue(mockFeature)

      const result = await service.hasFeature('org1', 'EXPORT_PDF')
      expect(result).toBe(false)
    })

    it('should return true when user override is enabled', async () => {
      const mockOverride: EntitlementOverride = { id: 'o1', scope: 'USER', scopeId: 'user1', featureKey: 'EXPORT_PDF', enabled: true, limitValue: null, expiresAt: null, reason: 'test', createdAt: new Date(), createdBy: 'admin' }
      const mockSubscription: Subscription = { id: 's1', orgId: 'org1', planKey: 'free', status: 'ACTIVE', stripeSubscriptionId: null, stripePriceId: null, currentPeriodStart: new Date(), currentPeriodEnd: new Date(), cancelAtPeriodEnd: false }
      
      ;(mockRepo.getOverride as any).mockResolvedValue(mockOverride)
      ;(mockRepo.getActiveSubscription as any).mockResolvedValue(mockSubscription)

      const result = await service.hasFeature('org1', 'EXPORT_PDF', 'user1')
      expect(result).toBe(true)
      expect(mockRepo.getOverride).toHaveBeenCalledWith('USER', 'user1', 'EXPORT_PDF')
    })

    it('should return false when user override disables feature (overrides plan)', async () => {
      const mockOverride: EntitlementOverride = { id: 'o1', scope: 'USER', scopeId: 'user1', featureKey: 'EXPORT_PDF', enabled: false, limitValue: null, expiresAt: null, reason: 'test', createdAt: new Date(), createdBy: 'admin' }
      const mockPlanFeature: PlanFeature = { id: 'pf1', planId: 'p1', featureId: 'f1', enabled: true, limitValue: null, configJson: null, downgradeStrategy: 'GRACEFUL' }
      const mockSubscription: Subscription = { id: 's1', orgId: 'org1', planKey: 'pro', status: 'ACTIVE', stripeSubscriptionId: null, stripePriceId: null, currentPeriodStart: new Date(), currentPeriodEnd: new Date(), cancelAtPeriodEnd: false }
      
      ;(mockRepo.getOverride as any).mockResolvedValue(mockOverride)
      ;(mockRepo.getActiveSubscription as any).mockResolvedValue(mockSubscription)
      ;(mockRepo.getPlanFeatures as any).mockResolvedValue([mockPlanFeature])

      const result = await service.hasFeature('org1', 'EXPORT_PDF', 'user1')
      expect(result).toBe(false) // Override takes precedence
    })

    it('should return fallback when override is expired', async () => {
      const expiredDate = new Date('2020-01-01')
      const mockOverride: EntitlementOverride = { id: 'o1', scope: 'USER', scopeId: 'user1', featureKey: 'EXPORT_PDF', enabled: true, limitValue: null, expiresAt: expiredDate, reason: 'test', createdAt: new Date(), createdBy: 'admin' }
      const mockPlanFeature: PlanFeature = { id: 'pf1', planId: 'p1', featureId: 'f1', enabled: true, limitValue: null, configJson: null, downgradeStrategy: 'GRACEFUL' }
      const mockSubscription: Subscription = { id: 's1', orgId: 'org1', planKey: 'pro', status: 'ACTIVE', stripeSubscriptionId: null, stripePriceId: null, currentPeriodStart: new Date(), currentPeriodEnd: new Date(), cancelAtPeriodEnd: false }
      
      ;(mockRepo.getOverride as any).mockResolvedValue(mockOverride)
      ;(mockRepo.getActiveSubscription as any).mockResolvedValue(mockSubscription)
      ;(mockRepo.getPlanFeatures as any).mockResolvedValue([mockPlanFeature])

      const result = await service.hasFeature('org1', 'EXPORT_PDF', 'user1')
      expect(result).toBe(true) // Falls back to plan
    })
  })

  // =====================================================
  // GET LIMIT TESTS
  // =====================================================

  describe('getLimit', () => {
    it('should return limit from plan feature', async () => {
      const mockFeature: Feature = { id: 'f1', key: 'BULK_VALIDATION', description: '', type: 'LIMIT', defaultConfig: null }
      const mockPlanFeature: PlanFeature = { id: 'pf1', planId: 'p1', featureId: 'f1', enabled: true, limitValue: 1000, configJson: null, downgradeStrategy: 'GRACEFUL' }
      const mockSubscription: Subscription = { id: 's1', orgId: 'org1', planKey: 'pro', status: 'ACTIVE', stripeSubscriptionId: null, stripePriceId: null, currentPeriodStart: new Date(), currentPeriodEnd: new Date(), cancelAtPeriodEnd: false }
      
      ;(mockRepo.getOverride as any).mockResolvedValue(null)
      ;(mockRepo.getActiveSubscription as any).mockResolvedValue(mockSubscription)
      ;(mockRepo.getPlanFeatures as any).mockResolvedValue([mockPlanFeature])
      ;(mockRepo.getFeature as any).mockResolvedValue(mockFeature)

      const result = await service.getLimit('org1', 'BULK_VALIDATION')
      expect(result).toBe(1000)
    })

    it('should return null for unlimited (enterprise)', async () => {
      const mockFeature: Feature = { id: 'f1', key: 'BULK_VALIDATION', description: '', type: 'LIMIT', defaultConfig: null }
      const mockPlanFeature: PlanFeature = { id: 'pf1', planId: 'p1', featureId: 'f1', enabled: true, limitValue: null, configJson: null, downgradeStrategy: 'GRACEFUL' }
      const mockSubscription: Subscription = { id: 's1', orgId: 'org1', planKey: 'business', status: 'ACTIVE', stripeSubscriptionId: null, stripePriceId: null, currentPeriodStart: new Date(), currentPeriodEnd: new Date(), cancelAtPeriodEnd: false }
      
      ;(mockRepo.getOverride as any).mockResolvedValue(null)
      ;(mockRepo.getActiveSubscription as any).mockResolvedValue(mockSubscription)
      ;(mockRepo.getPlanFeatures as any).mockResolvedValue([mockPlanFeature])
      ;(mockRepo.getFeature as any).mockResolvedValue(mockFeature)

      const result = await service.getLimit('org1', 'BULK_VALIDATION')
      expect(result).toBe(null) // null = unlimited
    })
  })

  // =====================================================
  // CAN CONSUME TESTS
  // =====================================================

  describe('canConsume', () => {
    it('should return true when under limit', async () => {
      const mockFeature: Feature = { id: 'f1', key: 'BULK_VALIDATION', description: '', type: 'LIMIT', defaultConfig: null }
      const mockPlanFeature: PlanFeature = { id: 'pf1', planId: 'p1', featureId: 'f1', enabled: true, limitValue: 100, configJson: null, downgradeStrategy: 'GRACEFUL' }
      const mockSubscription: Subscription = { id: 's1', orgId: 'org1', planKey: 'pro', status: 'ACTIVE', stripeSubscriptionId: null, stripePriceId: null, currentPeriodStart: new Date(), currentPeriodEnd: new Date(), cancelAtPeriodEnd: false }
      const mockUsage: UsageTracking = { id: 'u1', orgId: 'org1', featureKey: 'BULK_VALIDATION', usageCount: 50, periodStart: new Date(), periodEnd: new Date() }
      
      ;(mockRepo.getOverride as any).mockResolvedValue(null)
      ;(mockRepo.getActiveSubscription as any).mockResolvedValue(mockSubscription)
      ;(mockRepo.getPlanFeatures as any).mockResolvedValue([mockPlanFeature])
      ;(mockRepo.getFeature as any).mockResolvedValue(mockFeature)
      ;(mockRepo.getUsageForCurrentPeriod as any).mockResolvedValue(mockUsage)

      const result = await service.canConsume('org1', 'BULK_VALIDATION', 10)
      expect(result).toBe(true) // 50 + 10 = 60 <= 100
    })

    it('should return false when at limit', async () => {
      const mockFeature: Feature = { id: 'f1', key: 'BULK_VALIDATION', description: '', type: 'LIMIT', defaultConfig: null }
      const mockPlanFeature: PlanFeature = { id: 'pf1', planId: 'p1', featureId: 'f1', enabled: true, limitValue: 100, configJson: null, downgradeStrategy: 'GRACEFUL' }
      const mockSubscription: Subscription = { id: 's1', orgId: 'org1', planKey: 'pro', status: 'ACTIVE', stripeSubscriptionId: null, stripePriceId: null, currentPeriodStart: new Date(), currentPeriodEnd: new Date(), cancelAtPeriodEnd: false }
      const mockUsage: UsageTracking = { id: 'u1', orgId: 'org1', featureKey: 'BULK_VALIDATION', usageCount: 95, periodStart: new Date(), periodEnd: new Date() }
      
      ;(mockRepo.getOverride as any).mockResolvedValue(null)
      ;(mockRepo.getActiveSubscription as any).mockResolvedValue(mockSubscription)
      ;(mockRepo.getPlanFeatures as any).mockResolvedValue([mockPlanFeature])
      ;(mockRepo.getFeature as any).mockResolvedValue(mockFeature)
      ;(mockRepo.getUsageForCurrentPeriod as any).mockResolvedValue(mockUsage)

      const result = await service.canConsume('org1', 'BULK_VALIDATION', 10)
      expect(result).toBe(false) // 95 + 10 = 105 > 100
    })

    it('should return true for unlimited', async () => {
      const mockFeature: Feature = { id: 'f1', key: 'BULK_VALIDATION', description: '', type: 'LIMIT', defaultConfig: null }
      const mockPlanFeature: PlanFeature = { id: 'pf1', planId: 'p1', featureId: 'f1', enabled: true, limitValue: null, configJson: null, downgradeStrategy: 'GRACEFUL' }
      const mockSubscription: Subscription = { id: 's1', orgId: 'org1', planKey: 'business', status: 'ACTIVE', stripeSubscriptionId: null, stripePriceId: null, currentPeriodStart: new Date(), currentPeriodEnd: new Date(), cancelAtPeriodEnd: false }
      const mockUsage: UsageTracking = { id: 'u1', orgId: 'org1', featureKey: 'BULK_VALIDATION', usageCount: 999999, periodStart: new Date(), periodEnd: new Date() }
      
      ;(mockRepo.getOverride as any).mockResolvedValue(null)
      ;(mockRepo.getActiveSubscription as any).mockResolvedValue(mockSubscription)
      ;(mockRepo.getPlanFeatures as any).mockResolvedValue([mockPlanFeature])
      ;(mockRepo.getFeature as any).mockResolvedValue(mockFeature)
      ;(mockRepo.getUsageForCurrentPeriod as any).mockResolvedValue(mockUsage)

      const result = await service.canConsume('org1', 'BULK_VALIDATION', 10)
      expect(result).toBe(true) // unlimited
    })
  })

  // =====================================================
  // DEBUG TRACE TESTS
  // =====================================================

  describe('getDebugTrace', () => {
    it('should return correct resolvedVia for user override', async () => {
      const mockOverride: EntitlementOverride = { id: 'o1', scope: 'USER', scopeId: 'user1', featureKey: 'EXPORT_PDF', enabled: true, limitValue: null, expiresAt: null, reason: 'test', createdAt: new Date(), createdBy: 'admin' }
      
      ;(mockRepo.getOverride as any).mockResolvedValue(mockOverride)

      const result = await service.getDebugTrace('org1', 'EXPORT_PDF', 'user1')
      
      expect(result.resolvedVia).toBe('user_override')
      expect(result.overrideId).toBe('o1')
      expect(result.overrideScope).toBe('USER')
    })

    it('should return correct resolvedVia for plan', async () => {
      const mockPlanFeature: PlanFeature = { id: 'pf1', planId: 'p1', featureId: 'f1', enabled: true, limitValue: null, configJson: null, downgradeStrategy: 'GRACEFUL' }
      const mockSubscription: Subscription = { id: 's1', orgId: 'org1', planKey: 'pro', status: 'ACTIVE', stripeSubscriptionId: null, stripePriceId: null, currentPeriodStart: new Date(), currentPeriodEnd: new Date(), cancelAtPeriodEnd: false }
      
      ;(mockRepo.getOverride as any).mockResolvedValue(null)
      ;(mockRepo.getActiveSubscription as any).mockResolvedValue(mockSubscription)
      ;(mockRepo.getPlanFeatures as any).mockResolvedValue([mockPlanFeature])

      const result = await service.getDebugTrace('org1', 'EXPORT_PDF')
      
      expect(result.resolvedVia).toBe('plan')
      expect(result.planKey).toBe('pro')
    })

    it('should return fallback when no subscription', async () => {
      ;(mockRepo.getOverride as any).mockResolvedValue(null)
      ;(mockRepo.getActiveSubscription as any).mockResolvedValue(null)

      const result = await service.getDebugTrace('org1', 'EXPORT_PDF')
      
      expect(result.resolvedVia).toBe('fallback')
      expect(result.value).toBe(false)
    })
  })
})