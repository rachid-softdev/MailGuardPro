// API Route: Tester un webhook
// POST /api/v1/webhooks/[id]/test

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { decryptToken } from "@/lib/crypto";
import { validateCsrfOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { validateWebhookUrlWithDns } from "@/lib/ssrf";

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

    // SSRF check with DNS resolution before sending test request
    const ssrfCheck = await validateWebhookUrlWithDns(webhook.url);
    if (!ssrfCheck.valid) {
      return NextResponse.json(
        { success: false, error: `Webhook URL blocked: ${ssrfCheck.error}` },
        { status: 400 },
      );
    }

    // Envoyer un payload de test
    const testPayload = {
      event: "test",
      timestamp: new Date().toISOString(),
      data: {
        message: "This is a test payload from MailGuard Pro",
        webhookId: webhook.id,
      },
    };

    // Decrypt the stored secret before signing
    const rawSecret = decryptToken(webhook.encryptedSecret);

    // Signer le payload avec le secret
    const signature = crypto
      .createHmac("sha256", rawSecret)
      .update(JSON.stringify(testPayload))
      .digest("hex");

    try {
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MailGuard-Signature": signature,
          "X-MailGuard-Event": "test",
        },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(10000), // 10s timeout
        redirect: "manual", // Prevent SSRF via redirect chains
      });

      return NextResponse.json({
        success: true,
        message: "Test request sent",
        details: {
          statusCode: response.status,
          statusText: response.statusText,
        },
      });
    } catch (fetchError) {
      return NextResponse.json({
        success: false,
        error: `Failed to send test request: ${fetchError instanceof Error ? fetchError.message : "Unknown error"}`,
      });
    }
  } catch (error) {
    console.error("[API] Webhook test error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
