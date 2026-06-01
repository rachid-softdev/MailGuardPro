// API Route: Account management
// DELETE /api/v1/user — Delete/anonymize account (GDPR compliance)

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { logError, loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";

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

    // 1. Get user's Stripe subscription ID (before anonymization)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeSubscriptionId: true, stripeCustomerId: true },
    });
    const stripeSubscriptionId = user?.stripeSubscriptionId;

    // 2. Anonymize & clean up all user data atomiquement (transaction Prisma)
    //    This runs FIRST because it's the primary operation (GDPR data deletion).
    //    Stripe cancellation follows after — it's a best-effort external call.
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

    // 3. Cancel Stripe subscription (best-effort après la suppression DB)
    //    Si Stripe échoue, l'utilisateur est déjà supprimé en DB.
    //    Un CRON de réconciliation Stripe↔DB devrait nettoyer ces cas.
    if (stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(stripeSubscriptionId);
      } catch {
        loggerApi.warn(
          { stripeSubscriptionId, userId },
          "DB deleted but Stripe cancellation failed. User may still have an active Stripe subscription. A reconciler job should clean this up.",
        );
      }
    }

    // 4. Audit log (non-bloquant)
    try {
      await logAudit({
        userId,
        action: AuditAction.USER_DELETED,
        resource: AuditResource.USER,
        metadata: { reason: "user_requested_deletion", timestamp: now.toISOString() },
      });
    } catch (err) {
      loggerApi.error({ err }, "Audit log failed (non-fatal)");
    }

    return NextResponse.json({ success: true, message: "Account deleted successfully" });
  } catch (error) {
    loggerApi.error({ err: error }, "Account deletion error");
    return NextResponse.json(
      { success: false, error: "Failed to delete account" },
      { status: 500 },
    );
  }
}
