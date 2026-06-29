// API Route: Debug entitlements (admin only)
// GET /api/debug/entitlements?orgId=X&feature=Y&userId=Z

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getFeatureGateService } from "@/services/feature-flags/serviceFactory";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    const feature = searchParams.get("feature");
    const userId = searchParams.get("userId") ?? undefined;

    if (!orgId || !feature) {
      return NextResponse.json(
        { error: "orgId and feature query parameters are required" },
        { status: 400 },
      );
    }

    const gate = getFeatureGateService();
    const trace = await gate.getDebugTrace(orgId, feature, userId);

    // Add org info for context
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, stripeCustomerId: true },
    });

    // Add subscription info
    const sub = await prisma.subscription.findFirst({
      where: { orgId, status: { in: ["ACTIVE", "TRIALING"] } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      org,
      subscription: sub
        ? {
            id: sub.id,
            planKey: sub.planKey,
            status: sub.status,
            currentPeriodEnd: sub.currentPeriodEnd,
          }
        : null,
      debugTrace: trace,
    });
  } catch (error: any) {
    if (error.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    loggerApi.error({ err: error }, "Debug entitlements error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
