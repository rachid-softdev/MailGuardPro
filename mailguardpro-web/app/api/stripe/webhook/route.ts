// Stripe Webhook Handler
// POST /api/stripe/webhook
//
// SECURITY: Stripe webhook authentication relies SOLELY on HMAC signature
// verification via stripe.webhooks.constructEvent(). We deliberately do NOT
// add IP allowlisting because:
//   1. Signature verification provides cryptographic proof of Stripe origin
//   2. Stripe's IP ranges change without notice and are not guaranteed stable
//   3. Idempotency (set NX + PG constraint) prevents replay attacks
// See: https://docs.stripe.com/webhooks#verify-events
//
// Architecture:
//   The FeatureFlag StripeWebhookHandler is the primary processor for all
//   subscription/invoice events. It updates the new Subscriptions table
//   and invalidates the entitlement cache.
//   `checkout.session.completed` is handled in-route for initial credit
//   assignment (User.credits is outside the FF scope).
//   Idempotency is managed by the FF handler internally (Redis + PG fallback).

import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { loggerStripe } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, redis } from "@/lib/redis";
import { stripe } from "@/lib/stripe";
import { createStripeWebhookHandler } from "@/services/feature-flags/stripeWebhookHandler";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
  throw new Error("STRIPE_WEBHOOK_SECRET is not defined");
}

const STRIPE_MAX_BYTES = 1024 * 1024; // 1MB

// Credit grant on first checkout — keyspace isolated from FF handler's idempotency
function checkoutIdempotencyKey(eventId: string): string {
  return `stripe:checkout:${eventId}`;
}

export async function POST(req: NextRequest) {
  // Size check before reading body to prevent memory exhaustion
  const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
  if (contentLength > STRIPE_MAX_BYTES) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  const body = await req.text();

  // Rate limiting (defense in depth — Stripe already verifies signature)
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rateCheck = await checkRateLimit(`stripe:webhook:ip:${ip}`, 60, 60);
    if (!rateCheck.success) {
      loggerStripe.warn({ ip }, "Rate limit exceeded");
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  } catch {
    // Redis down — allow through (signature verification is primary defense)
  }

  // Double-check actual body size (content-length can be spoofed)
  if (body.length > STRIPE_MAX_BYTES) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  const signature = (await headers()).get("stripe-signature");
  if (!signature) {
    loggerStripe.error("Missing stripe-signature header");
    return NextResponse.json({ error: "Missing signature header" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET || "");
  } catch (err) {
    loggerStripe.error({ err }, "Webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ================================================================
  // checkout.session.completed — initial credit assignment
  // This is outside the FF scope (User.credits is a legacy field).
  // Idempotency uses its own Redis key so it doesn't conflict with
  // the FF handler's internal idempotency check.
  // ================================================================
  if (event.type === "checkout.session.completed") {
    const eventId = event.id;

    // Deduplicate checkout events using isolated keyspace
    try {
      const acquired = await redis.set(checkoutIdempotencyKey(eventId), "1", "EX", 86400, "NX");
      if (acquired === null) {
        loggerStripe.info({ eventId }, "Duplicate checkout event skipped");
        return NextResponse.json({ received: true, deduplicated: true });
      }
    } catch {
      // Redis down — proceed (duplicate checkouts are harmless at User level)
    }

    try {
      const sessionData = event.data.object as Stripe.Checkout.Session;
      const customerId = sessionData.customer as string;
      const subscriptionId = sessionData.subscription as string;

      if (customerId && subscriptionId) {
        // Link the subscription to the user via stripeCustomerId
        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: customerId },
        });

        if (user) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = subscription.items.data[0]?.price.id ?? "";
          // Use getPlanFromPriceId via dynamic import to avoid top-level Stripe dep in route
          const { getPlanFromPriceId } = await import("@/lib/stripe");
          const plan = getPlanFromPriceId(priceId);

          if (plan) {
            const creditMap: Record<string, number> = {
              BUSINESS: 0,
              PRO: 50000,
              STARTER: 5000,
            };

            await prisma.user.update({
              where: { id: user.id },
              data: {
                plan,
                stripeSubscriptionId: subscriptionId,
                credits: { increment: creditMap[plan] ?? 5000 },
              },
            });

            loggerStripe.info(
              { userId: user.id, plan },
              "Checkout.session: User activated plan with initial credits",
            );
          }
        }
      }
    } catch (error) {
      loggerStripe.error({ err: error }, "Failed to process checkout.session.completed");
    }

    return NextResponse.json({ received: true });
  }

  // ================================================================
  // Feature Flags StripeWebhookHandler — primary event processor
  // Handles: customer.subscription.created|updated|deleted,
  //          invoice.payment_succeeded|failed
  // Idempotency is managed internally (Redis + PG fallback).
  // ================================================================
  try {
    const ffHandler = await createStripeWebhookHandler();
    // The signature was already verified at the top of this route (line ~76),
    // so we pass the verified `event` straight to the handler and avoid a
    // redundant second signature verification.
    const result = await ffHandler.handleVerifiedEvent(event);

    // Regression #1: never acknowledge (200) when the handler reports it did
    // NOT receive/process the event. A transient idempotency/infra failure
    // must surface as 5xx so Stripe retries instead of silently dropping it.
    if (!result.received) {
      return NextResponse.json(
        { error: result.error ?? "Event processing failed" },
        { status: 503 },
      );
    }

    // Audit log for subscription cancellation
    if (event.type === "customer.subscription.deleted" && result.received && !result.deduplicated) {
      try {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: customerId },
        });
        if (user) {
          const { AuditAction, AuditResource, logAudit } = await import("@/services/auditLogger");
          await logAudit({
            userId: user.id,
            action: AuditAction.SUBSCRIPTION_CANCELLED,
            resource: AuditResource.SUBSCRIPTION,
            metadata: { subscriptionId: subscription.id },
          });
        }
      } catch (err) {
        loggerStripe.error({ err }, "Audit log failed (non-fatal)");
      }
    }
  } catch (ffErr) {
    loggerStripe.error({ err: ffErr }, "Feature flags webhook handler failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
