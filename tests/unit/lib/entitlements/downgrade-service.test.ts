// =====================================================
// TESTS - DOWNGRADE SERVICE
// =====================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DowngradeService } from '@/lib/entitlements/downgrade-service'
import type { IEntitlementRepository } from '@/lib/entitlements/repository'

// Mock repository
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

describe('DowngradeService', () => {
  let service: DowngradeService
  let mockRepo: IEntitlementRepository

  beforeEach(() => {
    mockRepo = createMockRepo()
    service = new DowngradeService(mockRepo as any, { invalidate: vi.fn(), publishInvalidation: vi.fn() } as any)
    vi.clearAllMocks()
  })

  // =====================================================
  // GET DOWNGRADE PREVIEW TESTS
  // =====================================================

  describe('getDowngradePreview', () => {
    it('should return willLoseAccess for features being disabled', async () => {
      const mockSubscription = {
        id: 's1',
        orgId: 'org1',
        planKey: 'pro',
        status: 'ACTIVE' as any,
        currentPeriodEnd: new Date('2026-06-01'),
      }

      ;(mockRepo.getActiveSubscription as any).mockResolvedValue(mockSubscription)
      ;(mockRepo.getDowngradePreview as any).mockResolvedValue([
        { featureKey: 'EXPORT_PDF', currentValue: true, newValue: false, willBeAffected: true, downgradeStrategy: 'GRACEFUL' },
        { featureKey: 'BULK_VALIDATION', currentValue: 10000, newValue: 100, willBeAffected: true, downgradeStrategy: 'IMMEDIATE' },
      ])

      const result = await service.getDowngradePreview('org1', 'starter')

      expect(result.willLoseAccess).toContain('EXPORT_PDF')
      expect(result.willBeLimited).toContain('BULK_VALIDATION')
    })

    it('should throw if no active subscription', async () => {
      ;(mockRepo.getActiveSubscription as any).mockResolvedValue(null)

      await expect(service.getDowngradePreview('org1', 'free')).rejects.toThrow('No active subscription')
    })
  })

  // =====================================================
  // EXECUTE DOWNGRADE TESTS
  // =====================================================

  describe('executeDowngrade', () => {
    it('should handle graceful downgrade (keep access until period end)', async () => {
      const mockSubscription = {
        id: 's1',
        orgId: 'org1',
        planKey: 'pro',
        status: 'ACTIVE' as any,
        currentPeriodEnd: new Date('2026-06-01'),
      }

      ;(mockRepo.getActiveSubscription as any).mockResolvedValue(mockSubscription)
      ;(mockRepo.getDowngradePreview as any).mockResolvedValue([
        { featureKey: 'EXPORT_PDF', currentValue: true, newValue: false, willBeAffected: true, downgradeStrategy: 'GRACEFUL' },
      ])
      ;(mockRepo.getOverride as any).mockResolvedValue(null) // No existing override
      ;(mockRepo.createOverride as any).mockResolvedValue({})

      const result = await service.executeDowngrade('org1', 'free', false)

      expect(result.strategy).toBe('GRACEFUL')
      expect(result.scheduledFor).toEqual(new Date('2026-06-01'))
      expect(mockRepo.createOverride).toHaveBeenCalled()
    })

    it('should handle immediate downgrade', async () => {
      const mockSubscription = {
        id: 's1',
        orgId: 'org1',
        planKey: 'pro',
        status: 'ACTIVE' as any,
        currentPeriodEnd: new Date('2026-06-01'),
      }

      ;(mockRepo.getActiveSubscription as any).mockResolvedValue(mockSubscription)
      ;(mockRepo.getDowngradePreview as any).mockResolvedValue([
        { featureKey: 'EXPORT_PDF', currentValue: true, newValue: false, willBeAffected: true, downgradeStrategy: 'IMMEDIATE' },
      ])

      const result = await service.executeDowngrade('org1', 'free', true)

      expect(result.strategy).toBe('IMMEDIATE')
      expect(result.scheduledFor).toBeUndefined()
    })

    it('should handle freeze downgrade (block new actions)', async () => {
      const mockSubscription = {
        id: 's1',
        orgId: 'org1',
        planKey: 'pro',
        status: 'ACTIVE' as any,
        currentPeriodEnd: new Date('2026-06-01'),
      }

      ;(mockRepo.getActiveSubscription as any).mockResolvedValue(mockSubscription)
      ;(mockRepo.getDowngradePreview as any).mockResolvedValue([
        { featureKey: 'EXPORT_PDF', currentValue: true, newValue: false, willBeAffected: true, downgradeStrategy: 'FREEZE' },
      ])

      const result = await service.executeDowngrade('org1', 'free', false)

      expect(result.strategy).toBe('FREEZE')
    })

    it('should throw if no active subscription', async () => {
      ;(mockRepo.getActiveSubscription as any).mockResolvedValue(null)

      await expect(service.executeDowngrade('org1', 'free')).rejects.toThrow('No active subscription')
    })
  })

  // =====================================================
  // IS FEATURE ACCESSIBLE TESTS
  // =====================================================

  describe('isFeatureAccessibleAfterDowngrade', () => {
    it('should return true before period end for graceful', async () => {
      const futureDate = new Date()
      futureDate.setMonth(futureDate.getMonth() + 1)

      const mockSubscription = {
        id: 's1',
        orgId: 'org1',
        planKey: 'pro',
        status: 'ACTIVE' as any,
        currentPeriodEnd: futureDate,
      }

      ;(mockRepo.getActiveSubscription as any).mockResolvedValue(mockSubscription)
      ;(mockRepo.getDowngradePreview as any).mockResolvedValue([
        { featureKey: 'EXPORT_PDF', willBeAffected: true, downgradeStrategy: 'GRACEFUL' },
      ])

      const result = await service.isFeatureAccessibleAfterDowngrade('org1', 'EXPORT_PDF', 'starter')

      expect(result.accessible).toBe(true)
      expect(result.reason).toContain('Graceful')
    })

    it('should return false after period end for graceful', async () => {
      const pastDate = new Date()
      pastDate.setMonth(pastDate.getMonth() - 1)

      const mockSubscription = {
        id: 's1',
        orgId: 'org1',
        planKey: 'pro',
        status: 'ACTIVE' as any,
        currentPeriodEnd: pastDate,
      }

      ;(mockRepo.getActiveSubscription as any).mockResolvedValue(mockSubscription)
      ;(mockRepo.getDowngradePreview as any).mockResolvedValue([
        { featureKey: 'EXPORT_PDF', willBeAffected: true, downgradeStrategy: 'GRACEFUL' },
      ])

      const result = await service.isFeatureAccessibleAfterDowngrade('org1', 'EXPORT_PDF', 'starter')

      expect(result.accessible).toBe(false)
    })

    it('should return false for immediate strategy', async () => {
      const mockSubscription = {
        id: 's1',
        orgId: 'org1',
        planKey: 'pro',
        status: 'ACTIVE' as any,
        currentPeriodEnd: new Date(),
      }

      ;(mockRepo.getActiveSubscription as any).mockResolvedValue(mockSubscription)
      ;(mockRepo.getDowngradePreview as any).mockResolvedValue([
        { featureKey: 'EXPORT_PDF', willBeAffected: true, downgradeStrategy: 'IMMEDIATE' },
      ])

      const result = await service.isFeatureAccessibleAfterDowngrade('org1', 'EXPORT_PDF', 'starter')

      expect(result.accessible).toBe(false)
      expect(result.reason).toContain('Immediate')
    })

    it('should return false for freeze strategy', async () => {
      const mockSubscription = {
        id: 's1',
        orgId: 'org1',
        planKey: 'pro',
        status: 'ACTIVE' as any,
        currentPeriodEnd: new Date(),
      }

      ;(mockRepo.getActiveSubscription as any).mockResolvedValue(mockSubscription)
      ;(mockRepo.getDowngradePreview as any).mockResolvedValue([
        { featureKey: 'EXPORT_PDF', willBeAffected: true, downgradeStrategy: 'FREEZE' },
      ])

      const result = await service.isFeatureAccessibleAfterDowngrade('org1', 'EXPORT_PDF', 'starter')

      expect(result.accessible).toBe(false)
      expect(result.reason).toContain('Freeze')
    })
  })
})