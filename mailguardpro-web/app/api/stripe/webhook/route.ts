// Stripe Webhook Handler
// POST /api/stripe/webhook
// SECURITY: Stripe webhook authentication relies SOLELY on HMAC signature
// verification via stripe.webhooks.constructEvent(). We deliberately do NOT
// add IP allowlisting because:
//   1. Signature verification provides cryptographic proof of Stripe origin
//   2. Stripe's IP ranges change without notice and are not guaranteed stable
//   3. Our idempotency key mechanism (Redis SET NX) prevents replay attacks
// See: https://docs.stripe.com/webhooks#verify-events

import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { loggerStripe } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, redis } from "@/lib/redis";
import { getPlanFromPriceId, stripe } from "@/lib/stripe";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
  throw new Error("STRIPE_WEBHOOK_SECRET is not defined");
}

async function findUserByStripeCustomerId(customerId: string, eventType: string) {
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!user) {
    loggerStripe.error(
      { customerId, eventType },
      "ORPHAN EVENT — No user found for customer. User may have been deleted.",
    );
  }

  return user;
}

const STRIPE_MAX_BYTES = 1024 * 1024; // 1MB

// === IDEMPOTENCY CHECK (two-layer: Redis + PostgreSQL fallback) ===
async function checkIdempotency(eventId: string): Promise<"new" | "duplicate" | "error"> {
  // Layer 1: Redis (fast path)
  try {
    const acquired = await redis.set(`stripe:event:${eventId}`, "1", "EX", 86400, "NX");
    if (acquired === null) return "duplicate";
    return "new";
  } catch {
    loggerStripe.warn("Redis unavailable — using PostgreSQL idempotency fallback");
  }

  // Layer 2: PostgreSQL (reliable fallback)
  try {
    await prisma.stripeEvent.create({ data: { id: eventId } });
    return "new";
  } catch (err: any) {
    if (err?.code === "P2002") {
      // Prisma unique constraint violation
      return "duplicate";
    }
    loggerStripe.error({ err }, "PostgreSQL idempotency check failed");
    return "error";
  }
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

  // === IDEMPOTENCY CHECK (two-layer: Redis + PostgreSQL fallback) ===
  const eventId = event.id;

  const idempotencyResult = await checkIdempotency(eventId);
  if (idempotencyResult === "duplicate") {
    loggerStripe.info({ eventId }, "Duplicate event skipped");
    return NextResponse.json({ received: true, deduplicated: true });
  }
  if (idempotencyResult === "error") {
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      { status: 503, headers: { "Retry-After": "10" } },
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const sessionData = event.data.object as Stripe.Checkout.Session;
      const customerId = sessionData.customer as string;
      const subscriptionId = sessionData.subscription as string;

      if (customerId && subscriptionId) {
        const user = await findUserByStripeCustomerId(customerId, event.type);

        if (user) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = subscription.items.data[0]?.price.id ?? "";
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
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      // Find user by stripe customer ID
      const user = await findUserByStripeCustomerId(subscription.customer as string, event.type);

      if (user) {
        // Determine new plan from subscription (using shared mapping)
        const priceId = subscription.items.data[0]?.price.id ?? "";
        const mappedPlan = getPlanFromPriceId(priceId);
        const newPlan = subscription.status === "active" && mappedPlan ? mappedPlan : "FREE";

        await prisma.user.update({
          where: { id: user.id },
          data: { plan: newPlan },
        });

        loggerStripe.info({ userId: user.id, newPlan }, "User plan updated");
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      // Revenir à FREE en cas d'annulation
      const user = await findUserByStripeCustomerId(subscription.customer as string, event.type);

      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            plan: "FREE",
            stripeSubscriptionId: null,
          },
        });

        // Audit log
        try {
          await logAudit({
            userId: user.id,
            action: AuditAction.SUBSCRIPTION_CANCELLED,
            resource: AuditResource.SUBSCRIPTION,
            metadata: { subscriptionId: subscription.id },
          });
        } catch (err) {
          loggerStripe.error({ err }, "Audit log failed (non-fatal)");
        }

        loggerStripe.info({ userId: user.id }, "User subscription cancelled, reverted to FREE");
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.subscription as string;
      const customerId = invoice.customer as string;

      if (customerId && subscriptionId) {
        try {
          const user = await findUserByStripeCustomerId(customerId, event.type);

          if (user) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            const priceId = subscription.items.data[0]?.price.id;
            const plan = getPlanFromPriceId(priceId ?? "");

            if (!plan) {
              loggerStripe.error(
                { priceId, customerId, subscriptionId },
                "invoice.payment_succeeded: unknown priceId. Plan not updated. Check STRIPE_PRICE_ID env vars.",
              );
            }

            if (plan) {
              // Paiement récurrent : simplement maintenir le plan actif
              // Les crédits initiaux sont attribués dans checkout.session.completed
              await prisma.user.update({
                where: { id: user.id },
                data: { plan },
              });

              loggerStripe.info({ userId: user.id, plan }, "Recurring payment confirmed");
            }
          }
        } catch (error) {
          loggerStripe.error({ err: error }, "Failed to process invoice.payment_succeeded");
        }
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const attemptCount = invoice.attempt_count ?? 1;
      const threshold = Number(process.env.STRIPE_DOWNGRADE_ATTEMPT_THRESHOLD) || 3;

      loggerStripe.warn(
        { invoiceId: invoice.id, attemptCount, threshold },
        "Invoice payment failed",
      );

      if (customerId && attemptCount >= threshold) {
        try {
          const user = await findUserByStripeCustomerId(customerId, event.type);
          if (user) {
            // TODO: envoyer email d'avertissement avant downgrade
            await prisma.user.update({
              where: { id: user.id },
              data: { plan: "FREE", stripeSubscriptionId: null },
            });
            loggerStripe.info(
              { userId: user.id, attemptCount },
              "User reverted to FREE after failed payment attempts",
            );
          }
        } catch (error) {
          loggerStripe.error({ err: error }, "Failed to process payment failure");
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
