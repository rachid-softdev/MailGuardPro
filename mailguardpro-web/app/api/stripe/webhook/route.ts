// Stripe Webhook Handler
// POST /api/stripe/webhook

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { getPlanFromPriceId, stripe } from "@/lib/stripe";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
  throw new Error("STRIPE_WEBHOOK_SECRET is not defined");
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = (await headers()).get("stripe-signature");
  if (!signature) {
    console.error("[Stripe] Missing stripe-signature header");
    return NextResponse.json({ error: "Missing signature header" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
  } catch (err) {
    console.error("[Stripe] Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // === IDEMPOTENCY CHECK (atomique) ===
  const eventId = event.id;
  const eventIdKey = `stripe:event:${eventId}`;

  try {
    // SET NX = atomique : crée la clé seulement si elle n'existe pas
    const acquired = await redis.set(eventIdKey, "1", "NX", "EX", 86400);
    if (acquired === null) {
      console.log(`[Stripe] Duplicate event skipped: ${eventId}`);
      return NextResponse.json({ received: true, deduplicated: true });
    }
  } catch (err) {
    console.warn(`[Stripe] Redis unavailable, skipping deduplication:`, err);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const sessionData = event.data.object as Stripe.Checkout.Session;
      console.log(`[Stripe] Checkout session completed: ${sessionData.id}`);
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      // Find user by stripe customer ID
      const user = await prisma.user.findFirst({
        where: { stripeCustomerId: subscription.customer as string },
      });

      if (user) {
        // Determine new plan from subscription (using shared mapping)
        const priceId = subscription.items.data[0]?.price.id ?? "";
        const mappedPlan = getPlanFromPriceId(priceId);
        const newPlan = subscription.status === "active" && mappedPlan ? mappedPlan : "FREE";

        await prisma.user.update({
          where: { id: user.id },
          data: { plan: newPlan },
        });

        console.log(`[Stripe] User ${user.id} plan updated to ${newPlan}`);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      // Revenir à FREE en cas d'annulation
      const user = await prisma.user.findFirst({
        where: { stripeCustomerId: subscription.customer as string },
      });

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
          console.error("[Stripe] Audit log failed (non-fatal):", err);
        }

        console.log(`[Stripe] User ${user.id} subscription cancelled, reverted to FREE`);
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.subscription as string;
      const customerId = invoice.customer as string;

      if (customerId && subscriptionId) {
        try {
          const user = await prisma.user.findFirst({
            where: { stripeCustomerId: customerId },
          });

          if (user) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            const priceId = subscription.items.data[0]?.price.id;
            const plan = getPlanFromPriceId(priceId ?? "");

            if (plan) {
              // Vérifier si c'est le premier paiement (crédits initiaux)
              const firstPaymentKey = `stripe:first_payment:${subscriptionId}`;
              let isFirstPayment = false;

              try {
                const acquired = await redis.set(firstPaymentKey, "1", "NX", "EX", 2592000); // 30 jours
                isFirstPayment = acquired === "OK";
              } catch (err) {
                console.warn(`[Stripe] Redis check failed, assuming first payment:`, err);
                isFirstPayment = true;
              }

              if (isFirstPayment) {
                const creditMap: Record<string, number> = {
                  BUSINESS: 0,
                  PRO: 50000,
                  STARTER: 5000,
                };

                await prisma.user.update({
                  where: { id: user.id },
                  data: {
                    plan,
                    credits: { increment: creditMap[plan] ?? 5000 },
                  },
                });

                console.log(
                  `[Stripe] Plan activated with initial credits for user ${user.id}: ${plan}`,
                );
              } else {
                // Paiement récurrent : simplement maintenir le plan actif
                await prisma.user.update({
                  where: { id: user.id },
                  data: { plan },
                });

                console.log(`[Stripe] Recurring payment confirmed for user ${user.id}: ${plan}`);
              }
            }
          }
        } catch (error) {
          console.error("[Stripe] Failed to process invoice.payment_succeeded:", error);
        }
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      console.error(`[Stripe] Invoice payment failed: ${invoice.id}`);

      if (customerId) {
        try {
          const user = await prisma.user.findFirst({
            where: { stripeCustomerId: customerId },
          });
          if (user) {
            await prisma.user.update({
              where: { id: user.id },
              data: { plan: "FREE", stripeSubscriptionId: null },
            });
            console.log(`[Stripe] User ${user.id} reverted to FREE due to payment failure`);
          }
        } catch (error) {
          console.error("[Stripe] Failed to process payment failure:", error);
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
