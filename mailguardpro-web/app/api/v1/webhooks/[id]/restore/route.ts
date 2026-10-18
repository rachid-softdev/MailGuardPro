// API Route: Restore a soft-deleted webhook
// POST /api/v1/webhooks/[id]/restore

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // CSRF protection
    const csrf = validateCsrfOrigin(req);
    if (!csrf.valid) {
      return NextResponse.json({ success: false, error: csrf.error }, { status: 403 });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify the webhook exists, is owned by user, and is soft-deleted
    const webhook = await prisma.webhook.findFirst({
      where: {
        id,
        userId: session.user.id,
        deletedAt: { not: null },
      },
    });

    if (!webhook) {
      return NextResponse.json(
        { success: false, error: "Webhook not found or not deleted" },
        { status: 404 },
      );
    }

    const restored = await prisma.webhook.update({
      where: { id },
      data: {
        deletedAt: null,
        restoredAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, data: restored });
  } catch (error) {
    loggerApi.error({ err: error }, "Webhook restore error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
