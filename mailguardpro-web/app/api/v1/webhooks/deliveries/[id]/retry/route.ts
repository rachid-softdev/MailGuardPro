// API Route: Manual redelivery of a failed webhook delivery
// POST /api/v1/webhooks/deliveries/[id]/retry
//
// Re-sends the event stored on a failed delivery as a single immediate attempt
// (WebhookDispatcher.redeliver — no automatic backoff, the user can click again).
// The attempt goes through the regular dispatch path (DNS pinning + HMAC signature)
// and is persisted as a NEW WebhookDelivery row so retries stay auditable.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimitByPlan, type Plan } from "@/lib/rateLimits";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";
import { WebhookDispatcher } from "@/services/webhookDispatcher";

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

    // Ownership check (IDOR guard) — the delivery must belong to one of the
    // user's non-soft-deleted webhooks
    const delivery = await prisma.webhookDelivery.findFirst({
      where: { id, webhook: { userId: session.user.id, deletedAt: null } },
      include: { webhook: true },
    });
    if (!delivery) {
      return NextResponse.json({ success: false, error: "Delivery not found" }, { status: 404 });
    }

    if (delivery.status !== "failed") {
      return NextResponse.json(
        { success: false, error: "Only failed deliveries can be retried" },
        { status: 400 },
      );
    }

    const webhook = delivery.webhook;
    if (!webhook.isActive) {
      return NextResponse.json(
        {
          success: false,
          error: "This webhook is disabled. Enable it before retrying deliveries.",
        },
        { status: 409 },
      );
    }
    if (!webhook.events.includes(delivery.event)) {
      return NextResponse.json(
        { success: false, error: `This webhook no longer subscribes to "${delivery.event}".` },
        { status: 409 },
      );
    }

    // The stored request body is the dispatched payload ({ event, timestamp, data })
    const storedBody =
      delivery.requestBody && typeof delivery.requestBody === "object"
        ? (delivery.requestBody as Record<string, unknown>)
        : null;
    const data =
      storedBody && storedBody.data && typeof storedBody.data === "object"
        ? (storedBody.data as Record<string, unknown>)
        : {};

    const delivered = await WebhookDispatcher.redeliver(webhook, delivery.event, data);

    // Audit log (non-blocking)
    void logAudit({
      userId: session.user.id,
      action: AuditAction.WEBHOOK_TRIGGERED,
      resource: AuditResource.WEBHOOK,
      resourceId: webhook.id,
      ipAddress: req.headers.get("x-forwarded-for") || undefined,
      metadata: {
        redeliveryOf: delivery.id,
        event: delivery.event,
        url: webhook.url,
        outcome: delivered ? "success" : "failed",
      },
    });

    if (!delivered) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Redelivery attempt failed. Check the new entry in the delivery history for details.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        redeliveryOf: delivery.id,
        event: delivery.event,
        url: webhook.url,
      },
      message: "Delivery re-sent — the result was added to the delivery history.",
    });
  } catch (error) {
    loggerApi.error({ err: error }, "Webhook delivery retry error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
