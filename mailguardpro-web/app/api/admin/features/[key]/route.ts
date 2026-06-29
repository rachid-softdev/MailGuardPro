// API Route: Admin - Update feature
// PUT /api/admin/features/:key

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    await requireAdmin();
    const { key } = await params;
    const body = await req.json();

    const feature = await prisma.feature.update({
      where: { key },
      data: {
        description: body.description ?? undefined,
        defaultConfig: body.default_config ?? undefined,
      },
    });

    return NextResponse.json(feature);
  } catch (error: any) {
    if (error.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Feature not found" }, { status: 404 });
    }
    loggerApi.error({ err: error }, "Admin update feature error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
