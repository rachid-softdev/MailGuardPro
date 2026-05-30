// API Route: Account management
// DELETE /api/v1/user — Delete/anonymize account (GDPR compliance)

import { auth } from "@/lib/auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(req: NextRequest) {
  try {
    // Authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    // CSRF protection
    const csrf = validateCsrfOrigin(req);
    if (!csrf.valid) {
      return NextResponse.json({ success: false, error: csrf.error }, { status: 403 });
    }

    const userId = session.user.id;
    const now = new Date();

    // 1. Cancel Stripe subscription if exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeSubscriptionId: true, stripeCustomerId: true },
    });

    if (user?.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(user.stripeSubscriptionId);
      } catch {
        console.warn(`[API] Failed to cancel subscription for user ${userId}`);
      }
    }

    // 2-8. Anonymize & clean up all user data atomiquement (transaction Prisma)
    //       Stripe cancellation (étape 1) est déjà faite — c'est un appel externe.
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}@mailguard.pro`,
          name: "Deleted User",
          image: null,
          emailVerified: null,
          isActive: false,
          credits: 0,
          plan: "FREE",
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          tokenVersion: { increment: 1 },
        },
      }),
      prisma.session.deleteMany({ where: { userId } }),
      prisma.account.updateMany({
        where: { userId },
        data: {
          access_token: null,
          id_token: null,
          refresh_token: null,
        },
      }),
      prisma.validation.updateMany({
        where: { userId },
        data: {
          userId: null,
          apiKeyId: null,
          emailHash: null,
        },
      }),
      prisma.bulkJob.updateMany({
        where: { userId },
        data: {
          emailsJson: null,
        },
      }),
      prisma.apiKey.deleteMany({ where: { userId } }),
      prisma.webhook.deleteMany({ where: { userId } }),
    ]);

    // 9. Audit log (hors transaction — ne doit pas bloquer la suppression)
    try {
      await logAudit({
        userId,
        action: AuditAction.USER_DELETED,
        resource: AuditResource.USER,
        metadata: { reason: "user_requested_deletion", timestamp: now.toISOString() },
      });
    } catch (err) {
      console.error("[API] Audit log failed (non-fatal):", err);
    }

    return NextResponse.json({ success: true, message: "Account deleted successfully" });
  } catch (error) {
    console.error("[API] Account deletion error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete account" },
      { status: 500 },
    );
  }
}
