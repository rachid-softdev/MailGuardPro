// ================================================================
// StripeWebhookHandler — Sync subscriptions from Stripe events
// ================================================================
// CRITICAL: This is the most important part of a production SaaS.
//
// Events handled:
//   customer.subscription.created    → create subscription in DB
//   customer.subscription.updated    → update plan_key + status
//   customer.subscription.deleted    → set status to "canceled"
//   invoice.payment_succeeded        → renew current_period_*
//   invoice.payment_failed           → set to "past_due"
//
// Robustness rules:
//   - Always verify Stripe signature
//   - Idempotency: skip already-processed events
//   - Transactional: subscription update + cache invalidation
//   - Log every event with org_id resolved
//   - Dead letter queue if DB is down
// ================================================================

import Stripe from "stripe";
import { logger } from "@/lib/logger";
import type { ICacheService } from "./cacheService";
import { DowngradeService } from "./downgradeService";
import type { IEntitlementRepository } from "./entitlementRepository";
import type { SubscriptionStatus } from "./types";

// ---- Price IDs to plan key mapping ----
// Configure these via env variables or a registry
const PRICE_TO_PLAN: Record<string, string> = {};

function getPlanKeyFromPriceId(priceId: string): string | null {
  if (PRICE_TO_PLAN[priceId]) return PRICE_TO_PLAN[priceId];
  // Fallback to env-based mapping
  const mapping = process.env.STRIPE_PRICE_PLAN_MAPPING;
  if (mapping) {
    try {
      const parsed = JSON.parse(mapping) as Record<string, string>;
      return parsed[priceId] ?? null;
    } catch {
      // ignore
    }
  }
  // Default mapping using well-known env vars. Annual price IDs are optional;
  // an unset value must never match an empty price ID.
  const defaultMappings: Array<[string | undefined, string]> = [
    [process.env.STRIPE_STARTER_PRICE_ID, "STARTER"],
    [process.env.STRIPE_STARTER_ANNUAL_PRICE_ID, "STARTER"],
    [process.env.STRIPE_PRO_PRICE_ID, "PRO"],
    [process.env.STRIPE_PRO_ANNUAL_PRICE_ID, "PRO"],
    [process.env.STRIPE_BUSINESS_PRICE_ID, "BUSINESS"],
    [process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID, "BUSINESS"],
  ];
  for (const [id, plan] of defaultMappings) {
    if (id && priceId === id) return plan;
  }
  return null;
}

/**
 * Stripe moved the invoice → subscription link under `parent` in API
 * 2025-03-31.basil. Keep the legacy top-level fallback for events created
 * under older API versions.
 */
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parentSubscription = invoice.parent?.subscription_details?.subscription;
  const subscription = parentSubscription ?? (invoice as any).subscription;
  if (!subscription) return null;
  return typeof subscription === "string" ? subscription : subscription.id;
}

/**
 * Subscription periods moved from the subscription root to its items in the
 * same API version. Fall back to the old shape for older event payloads.
 */
function getSubscriptionPeriod(subscription: Stripe.Subscription): {
  start: Date | null;
  end: Date | null;
} {
  const item = subscription.items?.data?.[0];
  const start = item?.current_period_start ?? (subscription as any).current_period_start ?? null;
  const end = item?.current_period_end ?? (subscription as any).current_period_end ?? null;
  return {
    start: start ? new Date(start * 1000) : null,
    end: end ? new Date(end * 1000) : null,
  };
}

function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "incomplete":
      return "incomplete";
    case "incomplete_expired":
      return "incomplete_expired";
    default:
      return "incomplete";
  }
}

export interface StripeWebhookResult {
  received: boolean;
  deduplicated?: boolean;
  eventType?: string;
  orgId?: string;
  error?: string;
}

export class StripeWebhookHandler {
  private readonly webhookSecret: string;
  private readonly stripe: Stripe;

  constructor(
    private readonly repo: IEntitlementRepository,
    private readonly cache: ICacheService,
    stripe?: Stripe,
    webhookSecret?: string,
  ) {
    this.webhookSecret = webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET ?? "";

    if (!this.webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is required");
    }

    if (stripe) {
      this.stripe = stripe;
    } else {
      const secretKey = process.env.STRIPE_SECRET_KEY;
      if (!secretKey) {
        throw new Error("STRIPE_SECRET_KEY is required when no Stripe instance is provided");
      }
      this.stripe = new Stripe(secretKey, {
        apiVersion: "2026-06-24.dahlia",
        typescript: true,
      });
    }
  }

  /**
   * Main entry point — verify signature, then route the verified event.
   * Kept for backward compatibility: callers that have NOT already verified
   * the Stripe signature use this. Prefer `handleVerifiedEvent` when the
   * signature was verified upstream (avoids a redundant re-verification).
   */
  async handleWebhookEvent(body: string, signature: string): Promise<StripeWebhookResult> {
    // 1. Verify signature
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(body, signature, this.webhookSecret);
    } catch (err) {
      logger.error({ err }, "StripeWebhook: signature verification failed");
      return { received: false, error: "Invalid signature" };
    }

    return this.handleVerifiedEvent(event);
  }

  /**
   * Handle an already signature-verified Stripe event: idempotency check +
   * event routing. Exposed so callers that verify the signature upstream
   * (e.g. the webhook route) can skip the redundant re-verification.
   */
  async handleVerifiedEvent(event: Stripe.Event): Promise<StripeWebhookResult> {
    // 1. Idempotency check
    const eventId = event.id;
    const idempotent = await this.checkIdempotency(eventId);
    if (idempotent === "duplicate") {
      logger.info({ eventId }, "StripeWebhook: duplicate event skipped");
      return { received: true, deduplicated: true, eventType: event.type };
    }
    if (idempotent === "error") {
      return { received: false, error: "Service temporarily unavailable" };
    }

    // 2. Route event
    try {
      switch (event.type) {
        case "customer.subscription.created":
          await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
          break;

        case "customer.subscription.updated":
          await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;

        case "customer.subscription.deleted":
          await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        case "invoice.payment_succeeded":
          await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;

        case "invoice.payment_failed":
          await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        default:
          logger.debug({ eventType: event.type }, "StripeWebhook: unhandled event type");
      }
    } catch (err) {
      logger.error(
        { err, eventId, eventType: event.type },
        "StripeWebhook: event processing failed",
      );
      // Release the idempotency marker so a transient failure does NOT mark
      // the event as consumed — Stripe's retry will reprocess it. Wrapped so a
      // release failure can never mask the original processing error.
      try {
        await this.releaseIdempotency(eventId);
      } catch (releaseErr) {
        logger.warn({ releaseErr, eventId }, "StripeWebhook: failed to release idempotency marker");
      }
      throw err; // Let caller handle — Stripe will retry
    }

    return { received: true, eventType: event.type };
  }

  // ================================================================
  // Event Handlers
  // ================================================================

  private async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
    const customerId = subscription.customer as string;
    const org = await this.resolveOrg(customerId, subscription.id);

    if (!org) {
      logger.warn(
        { customerId, subscriptionId: subscription.id },
        "StripeWebhook: no org found for subscription.created",
      );
      return;
    }

    const priceId = subscription.items.data[0]?.price.id ?? "";
    const planKey = getPlanKeyFromPriceId(priceId);
    const status = mapStripeStatus(subscription.status);
    const period = getSubscriptionPeriod(subscription);

    if (!planKey) {
      // Do not fall back to FREE: an unknown price is a configuration error,
      // and silently downgrading a paying customer is worse than skipping the
      // legacy-plan sync until the price mapping is fixed.
      logger.error(
        { orgId: org.id, priceId, subscriptionId: subscription.id },
        "StripeWebhook: unknown price ID on subscription.created",
      );
      return;
    }

    await this.repo.upsertSubscription({
      org_id: org.id,
      plan_key: planKey,
      status,
      stripe_sub_id: subscription.id,
      current_period_start: period.start,
      current_period_end: period.end,
    });

    logger.info(
      { orgId: org.id, planKey, status, subscriptionId: subscription.id },
      "StripeWebhook: subscription created",
    );

    await this.cache.invalidate(org.id);

    // An incomplete subscription has not been paid yet. Store its status, but
    // wait for checkout/payment success or a later subscription.updated event
    // before granting the paid legacy plan.
    if (status === "active" || status === "trialing") {
      await this.syncUserPlan(org.id, planKey);
    }
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const customerId = subscription.customer as string;
    const org = await this.resolveOrg(customerId, subscription.id);

    if (!org) {
      logger.warn(
        { customerId, subscriptionId: subscription.id },
        "StripeWebhook: no org found for subscription.updated",
      );
      return;
    }

    // Check for plan change (downgrade/upgrade)
    const priceId = subscription.items.data[0]?.price.id ?? "";
    const newPlanKey = getPlanKeyFromPriceId(priceId);
    const status = mapStripeStatus(subscription.status);
    const period = getSubscriptionPeriod(subscription);

    if (newPlanKey) {
      await this.repo.upsertSubscription({
        org_id: org.id,
        plan_key: newPlanKey,
        status,
        stripe_sub_id: subscription.id,
        current_period_start: period.start,
        current_period_end: period.end,
      });

      // Only re-grant the paid plan to legacy User.plan when the
      // subscription is actually providing it. A past_due/canceled update
      // still resolves newPlanKey (price unchanged) but must NOT
      // re-sync a paid plan — otherwise the trailing
      // customer.subscription.updated (emited alongside
      // invoice.payment_failed) would undo the downgrade.
      if (status === "active" || status === "trialing") {
        const previousPlan = await this.getLegacyPlan(org.id);
        await this.syncUserPlan(org.id, newPlanKey);
        if (previousPlan) {
          await this.syncCreditsForPlanChange(org.id, previousPlan, newPlanKey);
        }
      }
    } else {
      // Just update status
      await this.repo.updateSubscriptionStatus(subscription.id, status);
    }

    logger.info(
      { orgId: org.id, planKey: newPlanKey ?? "unchanged", status },
      "StripeWebhook: subscription updated",
    );

    await this.cache.invalidate(org.id);
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const customerId = subscription.customer as string;
    const org = await this.resolveOrg(customerId, subscription.id);

    if (!org) {
      logger.warn(
        { customerId, subscriptionId: subscription.id },
        "StripeWebhook: no org found for subscription.deleted",
      );
      return;
    }

    await this.repo.updateSubscriptionStatus(subscription.id, "canceled");

    logger.info(
      { orgId: org.id, subscriptionId: subscription.id },
      "StripeWebhook: subscription canceled",
    );

    await this.cache.invalidate(org.id);
    await this.syncUserPlan(org.id, "FREE");
  }

  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    const subscriptionId = getInvoiceSubscriptionId(invoice);

    if (!customerId || !subscriptionId) return;

    const org = await this.resolveOrg(customerId, subscriptionId);
    if (!org) return;

    // Renew the period. Transient failures (Stripe API / DB) must propagate so
    // `handleVerifiedEvent` releases the idempotency marker and the route
    // answers 5xx — Stripe then retries the delivery instead of the renewal
    // being silently lost.
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    const period = getSubscriptionPeriod(subscription);

    const priceId = subscription.items.data[0]?.price.id ?? "";
    const planKey = getPlanKeyFromPriceId(priceId);

    if (!planKey) {
      logger.error(
        { orgId: org.id, subscriptionId, priceId },
        "StripeWebhook: unknown price ID on invoice.payment_succeeded",
      );
      return;
    }

    await this.repo.upsertSubscription({
      org_id: org.id,
      plan_key: planKey,
      status: "active",
      stripe_sub_id: subscriptionId,
      current_period_start: period.start,
      current_period_end: period.end,
    });

    await this.cache.invalidate(org.id);

    logger.info(
      { orgId: org.id, subscriptionId, planKey },
      "StripeWebhook: payment succeeded — period renewed",
    );

    // Capture the legacy plan before syncing so an upgrade grants its new
    // allowance regardless of whether invoice.payment_succeeded or
    // customer.subscription.updated arrives first. The grant is idempotent in
    // the sense that a later same-plan event sees no rank increase.
    const previousPlan = await this.getLegacyPlan(org.id);
    await this.syncUserPlan(org.id, planKey);
    if (previousPlan) {
      await this.syncCreditsForPlanChange(org.id, previousPlan, planKey);
    }

    // Refill the monthly allowance when this billing cycle is due. This is
    // idempotent with the daily reset cron: whichever runs first advances
    // `creditsResetAt`, and the other sees it is not due.
    try {
      const { resetCreditsForOrganization } = await import("@/lib/credits");
      await resetCreditsForOrganization(org.id, planKey as any);
    } catch (err) {
      // The subscription period is already renewed. A credit refill failure
      // must not make Stripe retry the whole event forever; the daily cron
      // will pick up the user because `creditsResetAt` remains due.
      logger.error({ err, orgId: org.id, planKey }, "StripeWebhook: credit refill failed");
    }
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    const subscriptionId = getInvoiceSubscriptionId(invoice);

    if (!customerId || !subscriptionId) return;

    const org = await this.resolveOrg(customerId, subscriptionId);
    if (!org) return;

    // Resolve the current billing period end so any freeze/graceful overrides
    // expire at the right time.
    let currentPeriodEnd: Date | null = null;
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      currentPeriodEnd = getSubscriptionPeriod(subscription).end;
    } catch {
      // Non-fatal: downgrade still proceeds without a period end.
    }

    // Regression #2: actually downgrade. Apply feature freeze/graceful
    // overrides via DowngradeService (reads the still-active subscription),
    // then flip the subscription to past_due and sync legacy User.plan to FREE.
    try {
      const downgrade = new DowngradeService(this.repo, this.cache);
      await downgrade.executeDowngrade(org.id, "FREE", currentPeriodEnd);
    } catch (err) {
      logger.error({ err, orgId: org.id, subscriptionId }, "StripeWebhook: downgrade failed");
    }

    await this.repo.updateSubscriptionStatus(subscriptionId, "past_due");

    logger.warn(
      { orgId: org.id, subscriptionId, attemptCount: invoice.attempt_count },
      "StripeWebhook: payment failed — subscription past_due, downgraded",
    );

    await this.cache.invalidate(org.id);
    await this.syncUserPlan(org.id, "FREE");
  }

  /**
   * Read the legacy plan before a subscription update so upgrades can grant
   * the new allowance immediately. Returns null when the user is not linked
   * to an organization (checkout handles that case) or the query fails.
   */
  private async getLegacyPlan(orgId: string): Promise<string | null> {
    try {
      const { prisma } = await import("@/lib/prisma");
      const user = await prisma.user.findFirst?.({
        where: { organizationId: orgId },
        orderBy: { createdAt: "asc" },
        select: { plan: true },
      });
      return user?.plan ?? null;
    } catch (err) {
      logger.warn({ err, orgId }, "StripeWebhook: failed to read legacy plan before update");
      return null;
    }
  }

  /**
   * Upgrades take effect immediately: set the balance to the new plan's
   * included allowance. Downgrades keep the remaining balance until the next
   * monthly refill, so unused credits are not confiscated mid-cycle.
   *
   * BUSINESS is the exception: its balance is not meaningful and can be 0 or
   * negative because single validations still decrement it. When a Business
   * user downgrades, grant the target plan's allowance if the balance is
   * non-positive so they do not land on a paid plan with zero credits.
   */
  private async syncCreditsForPlanChange(
    orgId: string,
    previousPlan: string,
    newPlan: string,
  ): Promise<void> {
    const rank: Record<string, number> = { FREE: 0, STARTER: 1, PRO: 2, BUSINESS: 3 };
    const previousRank = rank[previousPlan] ?? -1;
    const newRank = rank[newPlan] ?? -1;
    const isUpgrade = newRank > previousRank;
    const isBusinessDowngrade = previousPlan === "BUSINESS" && newPlan !== "BUSINESS";
    if (!isUpgrade && !isBusinessDowngrade) return;

    // The legacy User.plan column is an enum. A custom price→plan mapping must
    // not write an unknown key into it or zero out credits on a downgrade.
    if (!["FREE", "STARTER", "PRO", "BUSINESS"].includes(newPlan)) return;

    try {
      const { includedCreditsForPlan, isPaidPlan, nextMonthlyReset } = await import(
        "@/lib/credits"
      );
      if (isUpgrade && !isPaidPlan(newPlan)) return;

      const { prisma } = await import("@/lib/prisma");
      await prisma.user.updateMany({
        where: isBusinessDowngrade
          ? { organizationId: orgId, credits: { lte: 0 } }
          : { organizationId: orgId },
        data: {
          credits: includedCreditsForPlan(newPlan as any),
          creditsResetAt: nextMonthlyReset(),
        },
      });

      logger.info(
        { orgId, previousPlan, newPlan, isBusinessDowngrade },
        "StripeWebhook: plan-change allowance applied",
      );
    } catch (err) {
      logger.error(
        { err, orgId, previousPlan, newPlan },
        "StripeWebhook: plan-change allowance failed",
      );
    }
  }

  /**
   * Keep the legacy `User.plan` enum in sync with the feature-flag
   * `Subscriptions` table. Many routes still gate on User.plan, so it must
   * reflect the active plan or users lose/gain access incorrectly.
   */
  private async syncUserPlan(orgId: string, planKey: string): Promise<void> {
    try {
      const { prisma } = await import("@/lib/prisma");
      await prisma.user.updateMany({
        where: { organizationId: orgId },
        data: { plan: planKey as any },
      });
    } catch (err) {
      logger.error({ err, orgId, planKey }, "StripeWebhook: failed to sync legacy User.plan");
    }
  }

  // ================================================================
  // Helpers
  // ================================================================

  /**
   * Resolve organization from Stripe customer ID.
   * Creates org if it doesn't exist yet.
   */
  private async resolveOrg(
    customerId: string,
    _subscriptionId?: string,
  ): Promise<{ id: string; name: string | null; stripe_customer_id: string | null } | null> {
    let org = await this.repo.getOrganizationByStripeCustomerId(customerId);

    if (!org) {
      // Try to find via Stripe customer and create org
      try {
        const customer = await this.stripe.customers.retrieve(customerId);
        if (!customer.deleted) {
          const customerName = customer.name ?? customer.email ?? "Unknown Org";
          org = await this.repo.createOrganization({
            name: customerName,
            stripe_customer_id: customerId,
          });

          // Link existing user if email matches
          if (customer.email) {
            const existingUser = await this.findUserByEmail(customer.email);
            if (existingUser) {
              await this.linkUserToOrg(existingUser.id, org.id);
            }
          }
        }
      } catch (err) {
        logger.error({ err, customerId }, "StripeWebhook: failed to create org from customer");
        return null;
      }
    }

    return org;
  }

  private async findUserByEmail(email: string): Promise<{ id: string } | null> {
    // Import prisma directly to find user — this is a bootstrap concern
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    return user;
  }

  private async linkUserToOrg(userId: string, orgId: string): Promise<void> {
    const { prisma } = await import("@/lib/prisma");
    await prisma.user.update({
      where: { id: userId },
      data: { organizationId: orgId },
    });
  }

  /**
   * Idempotency check: two-layer (Redis + PostgreSQL fallback).
   */
  private async checkIdempotency(eventId: string): Promise<"new" | "duplicate" | "error"> {
    try {
      const { redis } = await import("@/lib/redis");
      const acquired = await redis.set(`stripe:event:${eventId}`, "1", "EX", 86400, "NX");
      if (acquired === null) return "duplicate";
      return "new";
    } catch {
      logger.warn("StripeWebhook: Redis unavailable for idempotency");
    }

    // PostgreSQL fallback
    try {
      const { prisma } = await import("@/lib/prisma");
      await prisma.stripeEvent.create({ data: { id: eventId } });
      return "new";
    } catch (err: any) {
      if (err?.code === "P2002") return "duplicate";
      logger.error({ err }, "StripeWebhook: idempotency check failed");
      return "error";
    }
  }

  /**
   * Release an idempotency marker so a transient processing failure does NOT
   * mark the event as consumed. Mirrors `checkIdempotency` in reverse: deletes
   * the Redis key and the PostgreSQL `stripeEvent` row. Non-fatal — any
   * failure is swallowed so it never masks the original processing error.
   */
  private async releaseIdempotency(eventId: string): Promise<void> {
    // Redis: delete the NX marker regardless of whether it was the active layer.
    try {
      const { redis } = await import("@/lib/redis");
      await redis.del(`stripe:event:${eventId}`);
    } catch {
      // Redis unreachable — fall through to the PG cleanup attempt.
    }

    // PostgreSQL fallback: delete the stripeEvent row created by checkIdempotency.
    try {
      const { prisma } = await import("@/lib/prisma");
      await prisma.stripeEvent.deleteMany({ where: { id: eventId } });
    } catch (err) {
      logger.warn({ err, eventId }, "StripeWebhook: failed to release PG idempotency row");
    }
  }
}

/**
 * Factory function to create the StripeWebhookHandler with default dependencies.
 */
export async function createStripeWebhookHandler(): Promise<StripeWebhookHandler> {
  const { prisma } = await import("@/lib/prisma");
  const { PrismaEntitlementRepository } = await import("./entitlementRepository");
  const { getCacheService } = await import("./cacheService");
  const { redis } = await import("@/lib/redis");

  const repo = new PrismaEntitlementRepository(prisma);
  const cache = getCacheService(redis as any);

  return new StripeWebhookHandler(repo, cache);
}
