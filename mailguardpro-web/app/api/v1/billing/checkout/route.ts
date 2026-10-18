// API Route: Create a Stripe Checkout Session for a plan subscription
// POST /api/v1/billing/checkout
//
// Used by the billing page / pricing page CTAs for users who don't have a paid
// plan yet. Existing subscribers change plans through the Stripe customer
// portal (proration is handled by Stripe, and this avoids double billing).
//
// The 14-day free trial promised on the marketing site is applied here via
// `subscription_data.trial_period_days`. Stripe Checkout collects the payment
// method upfront; the card is only charged when the trial ends.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/request";
import { stripe } from "@/lib/stripe";

const checkoutSchema = z.object({
  plan: z.enum(["STARTER", "PRO", "BUSINESS"]),
  interval: z.enum(["month", "year"]).default("month"),
});

export async function POST(req: NextRequest) {
  try {
    // CSRF protection
    const csrf = validateCsrfOrigin(req);
    if (!csrf.valid) {
      return NextResponse.json({ success: false, error: csrf.error }, { status: 403 });
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

    const validation = checkoutSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Invalid plan" }, { status: 400 });
    }
    const { plan, interval } = validation.data;

    // Validate Stripe configuration (mirrors /billing/subscribe)
    const monthlyEnv = {
      STARTER: process.env.STRIPE_STARTER_PRICE_ID,
      PRO: process.env.STRIPE_PRO_PRICE_ID,
      BUSINESS: process.env.STRIPE_BUSINESS_PRICE_ID,
    } as const;
    const annualEnv = {
      STARTER: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID,
      PRO: process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
      BUSINESS: process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID,
    } as const;
    if (!monthlyEnv.STARTER || !monthlyEnv.PRO || !monthlyEnv.BUSINESS) {
      return NextResponse.json(
        { success: false, error: "Server configuration error: payment plans not configured" },
        { status: 500 },
      );
    }

    // Annual prices are optional (created in the Stripe dashboard). When the
    // requested plan has no annual price, fail with a clear 400.
    const priceId = interval === "year" ? annualEnv[plan] : monthlyEnv[plan];
    if (!priceId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Annual billing is not available for this plan yet — switch to monthly or contact support.",
        },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, name: true, plan: true, stripeCustomerId: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    // Checkout is only for free users starting a subscription. Users who already
    // have a paid plan must use the customer portal (avoids a second
    // subscription / double billing).
    if (user.plan !== "FREE") {
      return NextResponse.json(
        {
          success: false,
          error: "You already have an active plan — manage it via the billing portal.",
        },
        { status: 400 },
      );
    }

    // Get or create Stripe customer (same pattern as /billing/portal)
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      if (!user.email) {
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: session.user.id,
      metadata: { userId: session.user.id, plan },
      line_items: [{ price: priceId, quantity: 1 }],
      // 14-day free trial (marketing promise). The payment method is collected
      // now; the card is only charged when the trial ends.
      subscription_data: { trial_period_days: 14 },
      success_url: `${appUrl}/billing?checkout=success`,
      cancel_url: `${appUrl}/billing?checkout=cancelled`,
    });

    return NextResponse.json({
      success: true,
      data: {
        url: checkoutSession.url,
        sessionId: checkoutSession.id,
      },
    });
  } catch (error) {
    loggerApi.error({ err: error }, "Checkout session error");
    return NextResponse.json(
      { success: false, error: "Failed to create checkout session" },
      { status: 500 },
    );
  }
}
