// =====================================================
// TESTS - STRIPE WEBHOOK HANDLER
// =====================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StripeWebhookHandler } from '@/lib/entitlements/stripe-handler'
import Stripe from 'stripe'

// Mock repository
const mockRepo = {
  getOrganizationByStripeCustomerId: vi.fn(),
  createOrganization: vi.fn(),
  getSubscription: vi.fn(),
  createSubscription: vi.fn(),
  updateSubscription: vi.fn(),
  isWebhookEventProcessed: vi.fn(),
  markWebhookEventProcessed: vi.fn(),
}

// Mock featureGateService
const mockFeatureGate = {
  invalidateCache: vi.fn(),
}

vi.mock('@/lib/entitlements/prisma-repository', () => ({
  entitlementRepository: mockRepo,
}))

vi.mock('@/lib/entitlements/service', () => ({
  featureGateService: mockFeatureGate,
}))

vi.mock('@/lib/stripe', () => ({
  getPlanFromPriceId: vi.fn((priceId: string) => {
    if (priceId === 'price_pro') return 'pro'
    if (priceId === 'price_business') return 'business'
    return 'starter'
  }),
}))

describe('StripeWebhookHandler', () => {
  let handler: StripeWebhookHandler
  const mockSecret = 'whsec_test_secret'

  beforeEach(() => {
    handler = new StripeWebhookHandler(mockSecret)
    vi.clearAllMocks()
  })

  // =====================================================
  // VERIFY AND PARSE EVENT TESTS
  // =====================================================

  describe('verifyAndParseEvent', () => {
    it('should throw on invalid signature', () => {
      const body = '{"type":"test"}'
      const signature = 'invalid_signature'

      expect(() => {
        handler.verifyAndParseEvent(body, signature)
      }).toThrow('Invalid webhook signature')
    })
  })

  // =====================================================
  // PROCESS EVENT TESTS
  // =====================================================

  describe('processEvent', () => {
    it('should skip already processed events (idempotency)', async () => {
      ;(mockRepo.isWebhookEventProcessed as any).mockResolvedValue(true)

      const event = { id: 'evt_123', type: 'test' } as any
      const result = await handler.processEvent(event)

      expect(result.success).toBe(true)
      expect(mockRepo.markWebhookEventProcessed).not.toHaveBeenCalled()
    })

    it('should process subscription.created event', async () => {
      ;(mockRepo.isWebhookEventProcessed as any).mockResolvedValue(false)
      ;(mockRepo.getOrganizationByStripeCustomerId as any).mockResolvedValue(null)
      ;(mockRepo.createOrganization as any).mockResolvedValue({ id: 'org_123' })
      ;(mockRepo.createSubscription as any).mockResolvedValue({})

      const subscription = {
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        items: { data: [{ price: { id: 'price_pro' } }] },
        current_period_start: 1700000000,
        current_period_end: 1702600000,
      }

      const event = {
        id: 'evt_123',
        type: 'customer.subscription.created',
        data: { object: subscription },
      } as any

      const result = await handler.processEvent(event)

      expect(result.success).toBe(true)
      expect(mockRepo.createOrganization).toHaveBeenCalled()
      expect(mockRepo.createSubscription).toHaveBeenCalled()
      expect(mockFeatureGate.invalidateCache).toHaveBeenCalledWith('org_123')
    })

    it('should process subscription.updated event', async () => {
      ;(mockRepo.isWebhookEventProcessed as any).mockResolvedValue(false)
      ;(mockRepo.getOrganizationByStripeCustomerId as any).mockResolvedValue({ id: 'org_123' })
      ;(mockRepo.getSubscription as any).mockResolvedValue({ id: 'sub_123' })
      ;(mockRepo.updateSubscription as any).mockResolvedValue({})

      const subscription = {
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        items: { data: [{ price: { id: 'price_business' } }] },
        current_period_start: 1700000000,
        current_period_end: 1702600000,
        cancel_at_period_end: true,
      }

      const event = {
        id: 'evt_123',
        type: 'customer.subscription.updated',
        data: { object: subscription },
      } as any

      const result = await handler.processEvent(event)

      expect(result.success).toBe(true)
      expect(mockRepo.updateSubscription).toHaveBeenCalled()
    })

    it('should process subscription.deleted event', async () => {
      ;(mockRepo.isWebhookEventProcessed as any).mockResolvedValue(false)
      ;(mockRepo.getOrganizationByStripeCustomerId as any).mockResolvedValue({ id: 'org_123' })
      ;(mockRepo.getSubscription as any).mockResolvedValue({ id: 'sub_123' })
      ;(mockRepo.updateSubscription as any).mockResolvedValue({})

      const subscription = {
        id: 'sub_123',
        customer: 'cus_123',
      }

      const event = {
        id: 'evt_123',
        type: 'customer.subscription.deleted',
        data: { object: subscription },
      } as any

      const result = await handler.processEvent(event)

      expect(result.success).toBe(true)
      expect(mockRepo.updateSubscription).toHaveBeenCalledWith('sub_123', expect.objectContaining({ status: 'CANCELED' }))
    })

    it('should process invoice.payment_succeeded event', async () => {
      ;(mockRepo.isWebhookEventProcessed as any).mockResolvedValue(false)
      ;(mockRepo.getOrganizationByStripeCustomerId as any).mockResolvedValue({ id: 'org_123' })
      ;(mockRepo.getSubscription as any).mockResolvedValue({ id: 'sub_123' })
      ;(mockRepo.updateSubscription as any).mockResolvedValue({})

      const invoice = {
        id: 'inv_123',
        customer: 'cus_123',
        period_start: 1700000000,
        period_end: 1702600000,
      }

      const event = {
        id: 'evt_123',
        type: 'invoice.payment_succeeded',
        data: { object: invoice },
      } as any

      const result = await handler.processEvent(event)

      expect(result.success).toBe(true)
      expect(mockRepo.updateSubscription).toHaveBeenCalledWith('sub_123', expect.objectContaining({ status: 'ACTIVE' }))
    })

    it('should process invoice.payment_failed event', async () => {
      ;(mockRepo.isWebhookEventProcessed as any).mockResolvedValue(false)
      ;(mockRepo.getOrganizationByStripeCustomerId as any).mockResolvedValue({ id: 'org_123' })
      ;(mockRepo.getSubscription as any).mockResolvedValue({ id: 'sub_123' })
      ;(mockRepo.updateSubscription as any).mockResolvedValue({})

      const invoice = {
        id: 'inv_123',
        customer: 'cus_123',
      }

      const event = {
        id: 'evt_123',
        type: 'invoice.payment_failed',
        data: { object: invoice },
      } as any

      const result = await handler.processEvent(event)

      expect(result.success).toBe(true)
      expect(mockRepo.updateSubscription).toHaveBeenCalledWith('sub_123', expect.objectContaining({ status: 'PAST_DUE' }))
    })

    it('should skip unhandled event types', async () => {
      ;(mockRepo.isWebhookEventProcessed as any).mockResolvedValue(false)

      const event = {
        id: 'evt_123',
        type: 'unknown.event.type',
        data: { object: {} },
      } as any

      const result = await handler.processEvent(event)

      expect(result.success).toBe(true)
      expect(mockRepo.markWebhookEventProcessed).toHaveBeenCalled()
    })
  })

  // =====================================================
  // ERROR HANDLING TESTS
  // =====================================================

  describe('error handling', () => {
    it('should handle missing organization gracefully', async () => {
      ;(mockRepo.isWebhookEventProcessed as any).mockResolvedValue(false)
      ;(mockRepo.getOrganizationByStripeCustomerId as any).mockResolvedValue(null)

      const subscription = {
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        items: { data: [{ price: { id: 'price_pro' } }] },
        current_period_start: 1700000000,
        current_period_end: 1702600000,
      }

      const event = {
        id: 'evt_123',
        type: 'customer.subscription.created',
        data: { object: subscription },
      } as any

      const result = await handler.processEvent(event)

      // Should still succeed but create new org
      expect(result.success).toBe(true)
      expect(mockRepo.createOrganization).toHaveBeenCalled()
    })
  })
})