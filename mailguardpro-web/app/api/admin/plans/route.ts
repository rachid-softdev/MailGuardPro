// API Route: Admin - List plans
// GET /api/admin/plans?page=1&limit=20&sort=key:asc

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { PrismaEntitlementRepository } from "@/services/feature-flags/entitlementRepository";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
    const sort = searchParams.get("sort") || "key:asc";

    const repo = new PrismaEntitlementRepository(prisma);
    const result = await repo.listPlans(page, limit, sort);

    return NextResponse.json({
      data: result.data,
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
    });
  } catch (error: any) {
    if (error.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    loggerApi.error({ err: error }, "Admin list plans error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
