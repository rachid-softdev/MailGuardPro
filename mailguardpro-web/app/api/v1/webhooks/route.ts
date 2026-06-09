// API Route: Webhook management
// GET /api/v1/webhooks - List webhooks
// POST /api/v1/webhooks - Create a webhook

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { encryptToken } from "@/lib/crypto";
import { validateCsrfOrigin } from "@/lib/csrf";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimitByPlan, type Plan } from "@/lib/rateLimits";
import { parseJsonBody } from "@/lib/request";
import { validateWebhookUrlWithDns } from "@/lib/ssrf";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";

const createWebhookSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(100),
  events: z.array(z.string()).min(1),
});

export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const webhooks = await prisma.webhook.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        url: true,
        name: true,
        events: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: webhooks,
    });
  } catch (error) {
    loggerApi.error({ err: error }, "Webhooks list error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

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

    const { data: body, error: bodyError } = await parseJsonBody(req);
    if (bodyError) return bodyError;
    const validation = createWebhookSchema.safeParse(body);

    if (!validation.success) {
      loggerApi.warn({ errors: validation.error.errors }, "Input validation failed");
      return NextResponse.json(
        {
          success: false,
          error: "Invalid input",
        },
        { status: 400 },
      );
    }

    const { url, name, events } = validation.data;

    // SSRF validation + DNS resolution (single call — prevents DNS rebinding window)
    const ssrfCheck = await validateWebhookUrlWithDns(url);
    if (!ssrfCheck.valid) {
      return NextResponse.json(
        { success: false, error: `Webhook URL rejected: ${ssrfCheck.error}` },
        { status: 400 },
      );
    }

    // DNS Pinning: reuse IPs already resolved during SSRF validation
    if (!ssrfCheck.resolvedIps || ssrfCheck.resolvedIps.length === 0) {
      return NextResponse.json(
        { success: false, error: "Webhook URL rejected: no IPs resolved" },
        { status: 400 },
      );
    }
    const pinnedIps = JSON.stringify(ssrfCheck.resolvedIps);

    // Vérifier le nombre de webhooks existants
    const existingWebhooksCount = await prisma.webhook.count({
      where: { userId: session.user.id },
    });

    if (existingWebhooksCount >= 10) {
      return NextResponse.json(
        { success: false, error: "Maximum 10 webhooks allowed" },
        { status: 400 },
      );
    }

    // Générer un secret pour le webhook et le chiffrer avant stockage
    const rawSecret = crypto.randomBytes(32).toString("hex");
    const encryptedSecret = encryptToken(rawSecret);

    const webhook = await prisma.webhook.create({
      data: {
        url,
        name,
        events,
        encryptedSecret,
        pinnedIps,
        userId: session.user.id,
      },
    });

    // Audit log
    void logAudit({
      userId: session.user.id,
      action: AuditAction.WEBHOOK_CREATED,
      resource: AuditResource.WEBHOOK,
      resourceId: webhook.id,
      ipAddress: req.headers.get("x-forwarded-for") || undefined,
      metadata: { webhookName: name, url, events },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: webhook.id,
          url: webhook.url,
          name: webhook.name,
          events: webhook.events,
          rawSecretPrefix: rawSecret.substring(0, 4),
          isActive: webhook.isActive,
          createdAt: webhook.createdAt,
        },
        warning:
          "IMPORTANT: The rawSecret is shown only once at creation. " +
          "Save it securely — it will never be returned again. " +
          "If lost, you must regenerate the webhook secret.",
      },
      { status: 201 },
    );
  } catch (error) {
    loggerApi.error({ err: error }, "Webhook create error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
