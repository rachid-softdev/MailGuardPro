// API Route: Admin - Create override
// POST /api/admin/overrides  (reason is mandatory)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getFeatureGateService } from "@/services/feature-flags/serviceFactory";

const CreateOverrideSchema = z.object({
  scope: z.enum(["org", "user"]),
  scope_id: z.string().min(1, "scope_id is required"),
  feature_key: z.string().min(1, "feature_key is required"),
  enabled: z.boolean().nullable().optional(),
  limit_value: z.number().int().min(0).nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  reason: z.string().trim().min(1, "reason is required (admin)"),
});

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const body = await req.json();
    const parsed = CreateOverrideSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { scope, scope_id, feature_key, enabled, limit_value, expires_at, reason } = parsed.data;

    const gate = getFeatureGateService();

    const override = await prisma.entitlementOverride.create({
      data: {
        scope: scope === "org" ? "ORG" : "USER",
        scopeId: scope_id,
        featureKey: feature_key,
        enabled: enabled ?? null,
        limitValue: limit_value ?? null,
        expiresAt: expires_at ? new Date(expires_at) : null,
        reason,
      },
    });

    // Invalidate cache
    if (scope === "org") {
      await gate.invalidateCache(scope_id);
    }

    return NextResponse.json(override, { status: 201 });
  } catch (error: any) {
    if (error.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    loggerApi.error({ err: error }, "Admin create override error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
