// API Route: Subscribe to a plan
// POST /api/v1/billing/subscribe

import crypto from "node:crypto";
import { auth } from "@/lib/auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/request";
import { getPlanFromPriceId, stripe } from "@/lib/stripe";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  try {
    // CSRF protection
    const csrf = validateCsrfOrigin(req);
    if (!csrf.valid) {
      return NextResponse.json({ success: false, error: csrf.error }, { status: 403 });
    }

    // Validate Stripe configuration
    if (
      !process.env.STRIPE_STARTER_PRICE_ID ||
      !process.env.STRIPE_PRO_PRICE_ID ||
      !process.env.STRIPE_BUSINESS_PRICE_ID
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Server configuration error: payment plans not configured",
        },
        { status: 500 },
      );
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const { data: body, error: bodyError } = await parseJsonBody(req);
    if (bodyError) return bodyError;
    const { priceId, paymentMethodId } = body;

    if (!priceId || !paymentMethodId) {
      return NextResponse.json(
        { success: false, error: "priceId and paymentMethodId are required" },
        { status: 400 },
      );
    }

    // Validate priceId against known pricing plans
    const plan = getPlanFromPriceId(priceId);
    if (!plan) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid priceId: unrecognized pricing plan",
        },
        { status: 400 },
      );
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
    const idempotencyKey = crypto.randomUUID();
    const subscription = await stripe.subscriptions.create(
      {
        customer: customerId,
        items: [
          {
            price: priceId,
          },
        ],
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription" },
        expand: ["latest_invoice.payment_intent"],
      },
      { idempotencyKey: `mg-sub-${session.user.id}-${idempotencyKey}` },
    );

    // Store subscription reference; plan will be set by webhook after payment confirmation
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        stripeSubscriptionId: subscription.id,
      },
    });

    // Audit log — non-fatal
    try {
      await logAudit({
        userId: session.user.id,
        action: AuditAction.SUBSCRIPTION_CREATED,
        resource: AuditResource.SUBSCRIPTION,
        metadata: {
          plan: priceId,
          subscriptionId: subscription.id,
        },
      });
    } catch (err) {
      console.error("[API] Audit log failed (non-fatal):", err);
    }

    const latestInvoice = subscription.latest_invoice;
    const clientSecret =
      typeof latestInvoice === "object" && latestInvoice !== null
        ? (latestInvoice as Stripe.Invoice).payment_intent?.client_secret
        : undefined;

    return NextResponse.json({
      success: true,
      data: {
        subscriptionId: subscription.id,
        status: subscription.status,
        clientSecret,
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
