// API Route: Webhook delivery history
// GET /api/v1/webhooks/[id]/deliveries - List deliveries for a webhook

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const { id } = await params;

    // Verify webhook ownership
    const webhook = await prisma.webhook.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!webhook) {
      return NextResponse.json({ success: false, error: "Webhook not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
    const skip = (page - 1) * limit;

    const [deliveries, total] = await Promise.all([
      prisma.webhookDelivery.findMany({
        where: { webhookId: id },
        select: {
          id: true,
          event: true,
          status: true,
          statusCode: true,
          durationMs: true,
          error: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.webhookDelivery.count({ where: { webhookId: id } }),
    ]);

    return NextResponse.json({
      success: true,
      data: deliveries,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    loggerApi.error({ err: error }, "Webhook deliveries list error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
