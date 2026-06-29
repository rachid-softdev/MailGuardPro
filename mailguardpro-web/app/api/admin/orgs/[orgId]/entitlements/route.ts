// API Route: Admin - Get org entitlements
// GET /api/admin/orgs/:orgId/entitlements

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { loggerApi } from "@/lib/logger";
import { getFeatureGateService } from "@/services/feature-flags/serviceFactory";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    await requireAdmin();
    const { orgId } = await params;

    const gate = getFeatureGateService();
    const entitlements = await gate.getAllEntitlements(orgId);

    return NextResponse.json(entitlements);
  } catch (error: any) {
    if (error.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    loggerApi.error({ err: error }, "Admin get org entitlements error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
