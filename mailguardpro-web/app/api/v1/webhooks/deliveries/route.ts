// API Route: Webhook delivery history (all webhooks for the current user)
// GET /api/v1/webhooks/deliveries
// Query params: webhookId?, status?, page=1, limit=20

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const url = new URL(req.url);
    const webhookId = url.searchParams.get("webhookId") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
    const skip = (page - 1) * limit;

    // Filter deliveries that belong to the current user's webhooks
    const where: Record<string, unknown> = {
      webhook: { userId: session.user.id },
    };
    if (webhookId) where.webhookId = webhookId;
    if (status) where.status = status;

    const [deliveries, total] = await Promise.all([
      prisma.webhookDelivery.findMany({
        where,
        include: {
          webhook: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.webhookDelivery.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: deliveries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    loggerApi.error({ err: error }, "Webhook deliveries list error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
