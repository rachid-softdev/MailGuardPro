// API Route: Stripe Customer Portal
// POST /api/v1/billing/portal

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { stripeCustomerId: true },
    });

    if (!user?.stripeCustomerId) {
      // Create Stripe customer if doesn't exist
      const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { email: true, name: true },
      });

      if (!dbUser?.email) {
        return NextResponse.json({ success: false, error: "No email on file" }, { status: 400 });
      }

      const customer = await stripe.customers.create({
        email: dbUser.email,
        name: dbUser.name || undefined,
        metadata: { userId: session.user.id },
      });

      await prisma.user.update({
        where: { id: session.user.id },
        data: { stripeCustomerId: customer.id },
      });

      // Create portal session
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customer.id,
        return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings`,
      });

      return NextResponse.json({
        success: true,
        url: portalSession.url,
      });
    }

    // Create portal session for existing customer
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings`,
    });

    return NextResponse.json({
      success: true,
      url: portalSession.url,
    });
  } catch (error) {
    console.error("[API] Billing portal error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create billing portal session" },
      { status: 500 },
    );
  }
}
