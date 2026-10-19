// API Route: Admin - Invalidate cache for an org
// POST /api/admin/cache/invalidate/:orgId

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { validateCsrfOrigin } from "@/lib/csrf";
import { loggerApi } from "@/lib/logger";
import { getFeatureGateService } from "@/services/feature-flags/serviceFactory";

export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    // CSRF protection
    const csrf = validateCsrfOrigin(req);
    if (!csrf.valid) {
      return NextResponse.json({ error: csrf.error }, { status: 403 });
    }

    await requireAdmin();
    const { orgId } = await params;

    const gate = getFeatureGateService();
    await gate.invalidateCache(orgId);

    return NextResponse.json({ success: true, message: `Cache invalidated for org ${orgId}` });
  } catch (error: any) {
    if (error.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    loggerApi.error({ err: error }, "Admin invalidate cache error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
