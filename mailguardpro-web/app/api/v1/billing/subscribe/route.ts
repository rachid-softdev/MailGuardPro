// API Route: Subscribe to a plan
// POST /api/v1/billing/subscribe

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";
import { NextRequest, NextResponse } from "next/server";

const PLAN_BY_PRICE_ID: Record<string, string> = {
  [process.env.STRIPE_STARTER_PRICE_ID || ""]: "STARTER",
  [process.env.STRIPE_PRO_PRICE_ID || ""]: "PRO",
  [process.env.STRIPE_BUSINESS_PRICE_ID || ""]: "BUSINESS",
};

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const body = await req.json();
    const { priceId, paymentMethodId } = body;

    if (!priceId || !paymentMethodId) {
      return NextResponse.json(
        { success: false, error: "priceId and paymentMethodId are required" },
        { status: 400 },
      );
    }

    if (!priceId || !PLAN_BY_PRICE_ID[priceId]) {
      return NextResponse.json({ success: false, error: "Invalid price ID" }, { status: 400 });
    }

    // Get or create Stripe customer
    let user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, name: true, stripeCustomerId: true },
    });

    let customerId = user?.stripeCustomerId;

    if (!customerId) {
      if (!user?.email) {
        return NextResponse.json(
          { success: false, error: "User email is required for billing" },
          { status: 400 },
        );
      }

      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: { userId: session.user.id },
      });
      customerId = customer.id;

      await prisma.user.update({
        where: { id: session.user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    // Attach payment method
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    // Set as default payment method
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [
        {
          price: priceId,
        },
      ],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
    });

    // Only store subscription reference — plan activation happens in webhook
    await prisma.user.update({
      where: { id: session.user.id },
      data: { stripeSubscriptionId: subscription.id },
    });

    // Audit log
    logAudit({
      userId: session.user.id,
      action: AuditAction.SUBSCRIPTION_CREATED,
      resource: AuditResource.SUBSCRIPTION,
      metadata: {
        plan: priceId,
        subscriptionId: subscription.id,
      },
    });

    const invoice = subscription.latest_invoice as any;

    return NextResponse.json({
      success: true,
      data: {
        subscriptionId: subscription.id,
        status: subscription.status,
        clientSecret: invoice?.payment_intent?.client_secret,
      },
    });
  } catch (error) {
    console.error("[API] Subscribe error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create subscription" },
      { status: 500 },
    );
  }
}
