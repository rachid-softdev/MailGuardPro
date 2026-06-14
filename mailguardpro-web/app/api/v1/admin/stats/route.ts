// API Route: Admin - Dashboard stats
// GET /api/v1/admin/stats

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    // Check admin role (supports both old scalar role and new roles array)
    const isAdmin = session.user.role === "ADMIN" || session.user.roles?.includes("ADMIN");

    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: "Access denied. Admin role required." },
        { status: 403 },
      );
    }

    // Run counts in parallel for performance
    const [
      totalUsers,
      activeUsers,
      totalValidations,
      validationsToday,
      totalBulkJobs,
      activeWebhooks,
      totalApiKeys,
      usersByPlan,
      recentUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.validation.count(),
      prisma.validation.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      prisma.bulkJob.count(),
      prisma.webhook.count({ where: { isActive: true } }),
      prisma.apiKey.count(),
      prisma.user.groupBy({
        by: ["plan"],
        _count: { id: true },
      }),
      prisma.user.findMany({
        select: { id: true, name: true, email: true, plan: true, isActive: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        totalValidations,
        validationsToday,
        totalBulkJobs,
        activeWebhooks,
        totalApiKeys,
        usersByPlan: usersByPlan.map((entry: { plan: string; _count: { id: number } }) => ({
          plan: entry.plan,
          count: entry._count.id,
        })),
        recentUsers: recentUsers.map(
          (u: {
            id: string;
            name: string | null;
            email: string;
            plan: string;
            isActive: boolean;
            createdAt: Date;
          }) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            plan: u.plan,
            isActive: u.isActive,
            createdAt: u.createdAt,
          }),
        ),
      },
    });
  } catch (error) {
    loggerApi.error({ err: error }, "Admin stats error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
