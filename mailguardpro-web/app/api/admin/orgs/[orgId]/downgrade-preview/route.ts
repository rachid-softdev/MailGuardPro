// API Route: Admin - Preview downgrade impact
// GET /api/admin/orgs/:orgId/downgrade-preview?toPlan=PRO

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { loggerApi } from "@/lib/logger";
import { getDowngradeService } from "@/services/feature-flags/serviceFactory";

export async function GET(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    await requireAdmin();
    const { orgId } = await params;

    const { searchParams } = new URL(req.url);
    const toPlan = searchParams.get("toPlan");
    if (!toPlan) {
      return NextResponse.json({ error: "toPlan query parameter is required" }, { status: 400 });
    }

    const downgradeService = getDowngradeService();
    const preview = await downgradeService.previewDowngrade(orgId, toPlan);

    return NextResponse.json(preview);
  } catch (error: any) {
    if (error.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    loggerApi.error({ err: error }, "Admin downgrade preview error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
