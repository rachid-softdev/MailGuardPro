// API Route: Update/delete a webhook
// DELETE /api/v1/webhooks/[id]
// PATCH /api/v1/webhooks/[id]

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimitByPlan, type Plan } from "@/lib/rateLimits";
import { parseJsonBody } from "@/lib/request";
import { resolveWebhookIps, validateWebhookUrlWithDns } from "@/lib/ssrf";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";

const updateWebhookSchema = z.object({
  url: z.url().optional(),
  events: z.array(z.string()).min(1).optional(),
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    // Rate limit check
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

    // Vérifier que le webhook appartient à l'utilisateur
    const webhook = await prisma.webhook.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!webhook) {
      return NextResponse.json({ success: false, error: "Webhook not found" }, { status: 404 });
    }

    const now = new Date();
    const undoExpiresAt = new Date(now.getTime() + 5000);

    await prisma.webhook.update({
      where: { id },
      data: { deletedAt: now },
    });

    // Audit log
    void logAudit({
      userId: session.user.id,
      action: AuditAction.WEBHOOK_DELETED,
      resource: AuditResource.WEBHOOK,
      resourceId: id,
      ipAddress: req.headers.get("x-forwarded-for") || undefined,
      metadata: { webhookName: webhook.name, url: webhook.url.replace(/\?.*$/, "") },
    });

    return NextResponse.json({
      success: true,
      undoable: true,
      undoExpiresAt: undoExpiresAt.toISOString(),
    });
  } catch (error) {
    loggerApi.error({ err: error }, "Webhook delete error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    // Rate limit check
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
    const { data: body, error: bodyError } = await parseJsonBody(req);
    if (bodyError) return bodyError;

    // Validate input with Zod
    const validation = updateWebhookSchema.safeParse(body);
    if (!validation.success) {
      loggerApi.warn({ errors: validation.error.issues }, "Input validation failed");
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }

    // Verify webhook ownership
    const webhook = await prisma.webhook.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!webhook) {
      return NextResponse.json({ success: false, error: "Webhook not found" }, { status: 404 });
    }

    const { url, events, name, isActive } = validation.data;

    // Build update payload with only provided fields
    const updateData: Record<string, unknown> = {};

    // If URL is being updated, perform SSRF validation with DNS
    if (url) {
      const ssrfCheck = await validateWebhookUrlWithDns(url);
      if (!ssrfCheck.valid) {
        return NextResponse.json(
          { success: false, error: `Webhook URL rejected: ${ssrfCheck.error}` },
          { status: 400 },
        );
      }

      // DNS Pinning : résoudre et stocker les nouvelles IPs
      const webhookUrl = new URL(url);
      const hostname = webhookUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
      const ipResolution = await resolveWebhookIps(hostname);
      if (!ipResolution.valid || !ipResolution.ips) {
        return NextResponse.json(
          { success: false, error: `Webhook URL rejected: ${ipResolution.error}` },
          { status: 400 },
        );
      }
      updateData.pinnedIps = JSON.stringify(ipResolution.ips);
    }

    if (url !== undefined) updateData.url = url;
    if (events !== undefined) updateData.events = events;
    if (name !== undefined) updateData.name = name;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updated = await prisma.webhook.update({
      where: { id },
      data: updateData,
    });

    // Audit log
    void logAudit({
      userId: session.user.id,
      action: AuditAction.WEBHOOK_UPDATED,
      resource: AuditResource.WEBHOOK,
      resourceId: id,
      ipAddress: req.headers.get("x-forwarded-for") || undefined,
      metadata: { webhookName: updated.name, url: updated.url, changes: updateData },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        url: updated.url,
        name: updated.name,
        events: updated.events,
        isActive: updated.isActive,
      },
    });
  } catch (error) {
    loggerApi.error({ err: error }, "Webhook update error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
