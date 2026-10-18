// API Route: Regenerate a webhook's signing secret
// POST /api/v1/webhooks/[id]/regenerate-secret
//
// The secret is AES-256-GCM encrypted at rest (recoverable, unlike API keys) because the
// dispatcher must have the raw secret to compute HMAC signatures. Regeneration replaces the
// stored ciphertext and returns the new raw secret exactly once.

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { encryptToken } from "@/lib/crypto";
import { validateCsrfOrigin } from "@/lib/csrf";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimitByPlan, type Plan } from "@/lib/rateLimits";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    // Rate limit check (same bucket as the other webhook mutations)
    const rateCheck = await checkRateLimitByPlan(
      session.user.id,
      (session.user.plan as Plan) || "FREE",
      "webhooks",
    );
    if (!rateCheck.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Rate limit exceeded. Please try again later.",
          retryAfter: rateCheck.resetAt,
        },
        { status: 429 },
      );
    }

    const { id } = await params;

    // Ownership check (IDOR guard) — soft-deleted webhooks cannot be rotated
    const webhook = await prisma.webhook.findFirst({
      where: { id, userId: session.user.id, deletedAt: null },
    });
    if (!webhook) {
      return NextResponse.json({ success: false, error: "Webhook not found" }, { status: 404 });
    }

    // Generate + encrypt the new secret (same scheme as creation)
    const rawSecret = crypto.randomBytes(32).toString("hex");
    const encryptedSecret = encryptToken(rawSecret);

    await prisma.webhook.update({
      where: { id },
      data: { encryptedSecret },
    });

    // Audit log (non-blocking)
    void logAudit({
      userId: session.user.id,
      action: AuditAction.WEBHOOK_SECRET_REGENERATED,
      resource: AuditResource.WEBHOOK,
      resourceId: id,
      ipAddress: req.headers.get("x-forwarded-for") || undefined,
      metadata: { webhookName: webhook.name },
    });

    return NextResponse.json({
      success: true,
      data: {
        id,
        rawSecret,
        rawSecretPrefix: rawSecret.substring(0, 4),
      },
      warning:
        "IMPORTANT: The new rawSecret is shown only once. Update your endpoint immediately — " +
        "deliveries signed with the previous secret will fail signature verification.",
    });
  } catch (error) {
    loggerApi.error({ err: error }, "Webhook secret regeneration error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
