// API Route: Webhook management
// GET /api/v1/webhooks - List webhooks
// POST /api/v1/webhooks - Create a webhook

import crypto from "crypto";
import { auth } from "@/lib/auth";
import { encryptToken } from "@/lib/crypto";
import { validateCsrfOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { type Plan, checkRateLimitByPlan } from "@/lib/rateLimits";
import { parseJsonBody } from "@/lib/request";
import { resolveWebhookIps, validateWebhookUrlWithDns } from "@/lib/ssrf";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const createWebhookSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(100),
  events: z.array(z.string()).min(1),
});

export async function GET(req: NextRequest) {
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
    console.error("[API] Webhooks list error:", error);
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
      console.warn("[Validation] Input validation failed:", validation.error.errors);
      return NextResponse.json(
        {
          success: false,
          error: "Invalid input",
        },
        { status: 400 },
      );
    }

    const { url, name, events } = validation.data;

    // SSRF validation + HTTPS enforcement with DNS resolution
    const ssrfCheck = await validateWebhookUrlWithDns(url);
    if (!ssrfCheck.valid) {
      return NextResponse.json(
        { success: false, error: `Webhook URL rejected: ${ssrfCheck.error}` },
        { status: 400 },
      );
    }

    // DNS Pinning : résoudre et stocker les IPs
    const webhookUrl = new URL(url);
    const hostname = webhookUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const ipResolution = await resolveWebhookIps(hostname);
    if (!ipResolution.valid || !ipResolution.ips) {
      return NextResponse.json(
        { success: false, error: `Webhook URL rejected: ${ipResolution.error}` },
        { status: 400 },
      );
    }
    const pinnedIps = JSON.stringify(ipResolution.ips);

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
    console.error("[API] Webhook create error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
