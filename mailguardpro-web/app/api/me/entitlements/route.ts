// API Route: Get current user's entitlements
// GET /api/me/entitlements
// Cache 60s client-side — used by frontend hooks

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getFeatureGateService } from "@/services/feature-flags/serviceFactory";

export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const gate = getFeatureGateService();

    // Resolve orgId from user session
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { organizationId: true },
    });
    if (!user?.organizationId) {
      return NextResponse.json({ plan: "FREE", features: {}, limits: {}, usage: {}, reset_at: {} });
    }

    const entitlements = await gate.getAllEntitlements(user.organizationId);

    // Cache 60s client-side (the service layer handles server-side cache)
    return new NextResponse(JSON.stringify(entitlements), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=60, s-maxage=30",
      },
    });
  } catch (error) {
    loggerApi.error({ err: error }, "GET /api/me/entitlements error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
