// Stripe Webhook Handler
// POST /api/stripe/webhook

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { stripe, getPlanFromPriceId } from "@/lib/stripe";
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

  // === IDEMPOTENCY CHECK ===
  const eventId = event.id;
  const eventIdKey = `stripe:event:${eventId}`;

  try {
    const alreadyProcessed = await redis.get(eventIdKey);
    if (alreadyProcessed) {
      console.log(`[Stripe] Skipping duplicate event ${eventId}`);
      return NextResponse.json({ received: true, deduplicated: true });
    }
    await redis.setex(eventIdKey, 86400, "1");
  } catch {
    console.warn(`[Stripe] Redis unavailable, skipping deduplication for event ${eventId}`);
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
        const newPlan =
          subscription.status === "active" ? getPlanFromPriceId(priceId) : "FREE";

        await prisma.user.update({
          where: { id: user.id },
          data: { plan: newPlan as any },
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
        logAudit({
          userId: user.id,
          action: AuditAction.SUBSCRIPTION_CANCELLED,
          resource: AuditResource.SUBSCRIPTION,
          metadata: { subscriptionId: subscription.id },
        });

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

            if (plan !== "FREE") {
              const creditMap: Record<string, number> = {
                BUSINESS: 0,
                PRO: 50000,
                STARTER: 5000,
              };

              await prisma.user.update({
                where: { id: user.id },
                data: {
                  plan: plan as any,
                  credits: { increment: creditMap[plan] ?? 5000 },
                },
              });

              console.log(`[Stripe] Plan activated for user ${user.id}: ${plan}`);
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
      //Notifier l'utilisateur du problème de paiement
      console.error("[Stripe] Invoice payment failed:", invoice.id);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
