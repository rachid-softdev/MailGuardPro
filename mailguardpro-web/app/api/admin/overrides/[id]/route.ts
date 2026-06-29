// API Route: Admin - Delete override
// DELETE /api/admin/overrides/:id

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getFeatureGateService } from "@/services/feature-flags/serviceFactory";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;

    // Get the override first to know which org to invalidate
    const override = await prisma.entitlementOverride.findUnique({ where: { id } });
    if (!override) {
      return NextResponse.json({ error: "Override not found" }, { status: 404 });
    }

    await prisma.entitlementOverride.delete({ where: { id } });

    // Invalidate cache
    const gate = getFeatureGateService();
    if (override.scope === "ORG") {
      await gate.invalidateCache(override.scopeId);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Override not found" }, { status: 404 });
    }
    loggerApi.error({ err: error }, "Admin delete override error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
