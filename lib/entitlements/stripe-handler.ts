// =====================================================
// STRIPE WEBHOOK HANDLER
// =====================================================

import Stripe from 'stripe'
import { entitlementRepository } from './prisma-repository'
import { featureGateService } from './service'
import { getPlanFromPriceId } from '@/lib/stripe'

// Logger
const logger = {
  info: (msg: string, meta?: any) => console.log(`[StripeWebhook] ${msg}`, meta ?? ''),
  error: (msg: string, meta?: any) => console.error(`[StripeWebhook] ${msg}`, meta ?? ''),
}

// =====================================================
// HANDLER CLASS
// =====================================================

export class StripeWebhookHandler {
  constructor(private webhookSecret: string) {}

  // =====================================================
  // VERIFY AND PARSE EVENT
  // =====================================================

  verifyAndParseEvent(body: string, signature: string): Stripe.Event {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-11-20.acacia',
    })

    try {
      return stripe.webhooks.constructEvent(body, signature, this.webhookSecret)
    } catch (err) {
      logger.error('Webhook signature verification failed', { error: err })
      throw new Error('Invalid webhook signature')
    }
  }

  // =====================================================
  // PROCESS EVENT
  // =====================================================

  async processEvent(event: Stripe.Event): Promise<{ success: boolean; error?: string }> {
    // Check idempotency
    const alreadyProcessed = await entitlementRepository.isWebhookEventProcessed(event.id)
    if (alreadyProcessed) {
      logger.info(`Event already processed, skipping: ${event.id}`)
      return { success: true }
    }

    let orgId: string | undefined

    try {
      switch (event.type) {
        case 'customer.subscription.created':
          orgId = await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription)
          break

        case 'customer.subscription.updated':
          orgId = await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
          break

        case 'customer.subscription.deleted':
          orgId = await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
          break

        case 'invoice.payment_succeeded':
          orgId = await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice)
          break

        case 'invoice.payment_failed':
          orgId = await this.handlePaymentFailed(event.data.object as Stripe.Invoice)
          break

        default:
          logger.info(`Unhandled event type: ${event.type}`)
      }

      // Mark event as processed (idempotency)
      await entitlementRepository.markWebhookEventProcessed(event.id, orgId)

      // Invalidate cache if org was affected
      if (orgId) {
        await featureGateService.invalidateCache(orgId)
      }

      return { success: true }
    } catch (error) {
      logger.error(`Error processing event ${event.id}`, { error, type: event.type })
      return { success: false, error: String(error) }
    }
  }

  // =====================================================
  // HANDLERS FOR EACH EVENT
  // =====================================================

  private async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<string | undefined> {
    const customerId = subscription.customer as string
    
    // Find or create organization
    let org = await entitlementRepository.getOrganizationByStripeCustomerId(customerId)
    
    if (!org) {
      org = await entitlementRepository.createOrganization({
        stripeCustomerId: customerId,
        isPersonal: true,
      })
    }

    const priceId = subscription.items.data[0]?.price.id
    const planKey = getPlanFromPriceId(priceId)
    
    const periodStart = new Date(subscription.current_period_start * 1000)
    const periodEnd = new Date(subscription.current_period_end * 1000)

    // Create or update subscription
    await entitlementRepository.createSubscription({
      orgId: org.id,
      planKey,
      status: subscription.status === 'active' ? 'ACTIVE' : 
             subscription.status === 'trialing' ? 'TRIALING' : 'PAST_DUE',
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    })

    logger.info(`Subscription created for org ${org.id}`, { planKey, status: subscription.status })
    return org.id
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<string | undefined> {
    const customerId = subscription.customer as string
    const org = await entitlementRepository.getOrganizationByStripeCustomerId(customerId)

    if (!org) {
      logger.error(`Organization not found for customer ${customerId}`)
      return undefined
    }

    const existingSub = await entitlementRepository.getSubscription(org.id)
    if (!existingSub) {
      logger.error(`Subscription not found for org ${org.id}`)
      return org.id
    }

    const priceId = subscription.items.data[0]?.price.id
    const planKey = getPlanFromPriceId(priceId)
    
    const periodStart = new Date(subscription.current_period_start * 1000)
    const periodEnd = new Date(subscription.current_period_end * 1000)

    // Determine status
    let status: 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE' | 'INCOMPLETE_EXPIRED' = 'ACTIVE'
    
    switch (subscription.status) {
      case 'active':
        status = 'ACTIVE'
        break
      case 'trialing':
        status = 'TRIALING'
        break
      case 'past_due':
        status = 'PAST_DUE'
        break
      case 'canceled':
        status = 'CANCELED'
        break
      case 'incomplete':
        status = 'INCOMPLETE'
        break
      case 'incomplete_expired':
        status = 'INCOMPLETE_EXPIRED'
        break
    }

    // Update subscription
    await entitlementRepository.updateSubscription(existingSub.id, {
      planKey,
      status,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    })

    logger.info(`Subscription updated for org ${org.id}`, { planKey, status })
    return org.id
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<string | undefined> {
    const customerId = subscription.customer as string
    const org = await entitlementRepository.getOrganizationByStripeCustomerId(customerId)

    if (!org) {
      logger.error(`Organization not found for customer ${customerId}`)
      return undefined
    }

    const existingSub = await entitlementRepository.getSubscription(org.id)
    if (existingSub) {
      // Set to canceled - will take effect at period end
      await entitlementRepository.updateSubscription(existingSub.id, {
        status: 'CANCELED',
        cancelAtPeriodEnd: false, // Already canceled, take effect immediately
      })
    }

    logger.info(`Subscription deleted for org ${org.id}`)
    return org.id
  }

  private async handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<string | undefined> {
    const customerId = invoice.customer as string
    const org = await entitlementRepository.getOrganizationByStripeCustomerId(customerId)

    if (!org) {
      return undefined
    }

    const existingSub = await entitlementRepository.getSubscription(org.id)
    if (!existingSub) {
      return org.id
    }

    // Update period dates
    const periodStart = new Date(invoice.period_start * 1000)
    const periodEnd = new Date(invoice.period_end * 1000)

    await entitlementRepository.updateSubscription(existingSub.id, {
      status: 'ACTIVE', // Payment succeeded, restore to active
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    })

    logger.info(`Payment succeeded for org ${org.id}`)
    return org.id
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<string | undefined> {
    const customerId = invoice.customer as string
    const org = await entitlementRepository.getOrganizationByStripeCustomerId(customerId)

    if (!org) {
      return undefined
    }

    const existingSub = await entitlementRepository.getSubscription(org.id)
    if (!existingSub) {
      return org.id
    }

    // Mark as past due
    await entitlementRepository.updateSubscription(existingSub.id, {
      status: 'PAST_DUE',
    })

    logger.error(`Payment failed for org ${org.id}`, { invoiceId: invoice.id })
    return org.id
  }
}

// Export singleton factory
let stripeWebhookHandler: StripeWebhookHandler | null = null

export function getStripeWebhookHandler(): StripeWebhookHandler {
  if (!stripeWebhookHandler) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    if (!secret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured')
    }
    stripeWebhookHandler = new StripeWebhookHandler(secret)
  }
  return stripeWebhookHandler
}