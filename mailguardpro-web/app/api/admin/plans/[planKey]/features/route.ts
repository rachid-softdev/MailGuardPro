// API Route: Admin - Add feature to plan
// POST /api/admin/plans/:planKey/features

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const AddFeatureSchema = z.object({
  featureKey: z.string().min(1, "featureKey is required"),
  enabled: z.boolean().default(false),
  limitValue: z.number().int().min(0).nullable().optional(),
  configJson: z.record(z.unknown()).nullable().optional(),
  downgradeStrategy: z.enum(["graceful", "immediate", "freeze"]).default("immediate"),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ planKey: string }> }) {
  try {
    await requireAdmin();
    const { planKey } = await params;

    const body = await req.json();
    const parsed = AddFeatureSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { featureKey, enabled, limitValue, configJson, downgradeStrategy } = parsed.data;

    // Verify plan exists
    const plan = await prisma.pricingPlan.findUnique({ where: { key: planKey } });
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    // Verify feature exists
    const feature = await prisma.feature.findUnique({ where: { key: featureKey } });
    if (!feature) {
      return NextResponse.json({ error: "Feature not found" }, { status: 404 });
    }

    const planFeature = await prisma.planFeature.create({
      data: {
        planId: plan.id,
        featureId: feature.id,
        enabled,
        limitValue: limitValue ?? null,
        configJson: (configJson as any) ?? {},
        downgradeStrategy: downgradeStrategy.toUpperCase() as any,
      },
      include: { feature: true, plan: true },
    });

    return NextResponse.json(planFeature, { status: 201 });
  } catch (error: any) {
    if (error.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "Feature already exists on this plan" }, { status: 409 });
    }
    loggerApi.error({ err: error }, "Admin add plan feature error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
