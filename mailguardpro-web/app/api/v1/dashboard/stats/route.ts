// API Route: Dashboard real-time stats
// GET /api/v1/dashboard/stats

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const userId = session.user.id;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const sevenDaysAgo = new Date(startOfToday);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

    // Monday as start of week (dayOfWeek: 0=Sun → shift so Monday=0)
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);

    // --------------- Parallel independent queries ---------------

    const [
      user,
      thisMonthCount,
      byStatusThisMonth,
      avgScoreThisMonth,
      totalCount,
      last7DaysRecords,
      byStatusAll,
      allScores,
      recentValidations,
      todayCount,
      yesterdayCount,
      weekCount,
      monthCount,
      recentJobsRaw,
    ] = await Promise.all([
      // 1. User info
      prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, plan: true, credits: true },
      }),

      // 2. This month count
      prisma.validation.count({
        where: { userId, createdAt: { gte: startOfMonth } },
      }),

      // 3. By status this month
      prisma.validation.groupBy({
        by: ["status"],
        where: { userId, createdAt: { gte: startOfMonth } },
        _count: true,
      }),

      // 4. Avg score this month
      prisma.validation.aggregate({
        where: { userId, createdAt: { gte: startOfMonth } },
        _avg: { score: true },
      }),

      // 5. Total count all time
      prisma.validation.count({ where: { userId } }),

      // 6. Last 7 days records (for by-day chart)
      prisma.validation.findMany({
        where: { userId, createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true, score: true },
      }),

      // 7. By status all time
      prisma.validation.groupBy({
        by: ["status"],
        where: { userId },
        _count: true,
      }),

      // 8. All scores (for distribution)
      prisma.validation.findMany({
        where: { userId },
        select: { score: true },
      }),

      // 9. Recent validations (for activity feed)
      prisma.validation.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { email: true, score: true, status: true, createdAt: true },
      }),

      // 10. Today count
      prisma.validation.count({
        where: { userId, createdAt: { gte: startOfToday } },
      }),

      // 11. Yesterday count
      prisma.validation.count({
        where: { userId, createdAt: { gte: startOfYesterday, lt: startOfToday } },
      }),

      // 12. Week count
      prisma.validation.count({
        where: { userId, createdAt: { gte: startOfWeek } },
      }),

      // 13. Month count (for average)
      prisma.validation.count({
        where: { userId, createdAt: { gte: startOfMonth } },
      }),

      // 14. Recent bulk jobs
      prisma.bulkJob.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          filename: true,
          status: true,
          totalEmails: true,
          processed: true,
          createdAt: true,
        },
      }),
    ]);

    // --- Computed stats ---
    const validCount =
      byStatusThisMonth.find((s: { status: string }) => s.status === "valid")?._count || 0;
    const validRate = thisMonthCount > 0 ? Math.round((validCount / thisMonthCount) * 100) : 0;

    // --- Validations by day (last 7, grouped by date) ---
    const dayMap = new Map<string, { count: number; totalScore: number }>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(d.getDate() + i);
      dayMap.set(d.toISOString().split("T")[0], { count: 0, totalScore: 0 });
    }
    for (const record of last7DaysRecords) {
      const dateStr = record.createdAt.toISOString().split("T")[0];
      const entry = dayMap.get(dateStr);
      if (entry) {
        entry.count++;
        entry.totalScore += record.score;
      }
    }
    const validationsByDay = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        count: data.count,
        avgScore: data.count > 0 ? Math.round(data.totalScore / data.count) : 0,
      }));

    // --- Score distribution ---
    const distribution = [
      { range: "0-20", count: 0 },
      { range: "21-40", count: 0 },
      { range: "41-60", count: 0 },
      { range: "61-80", count: 0 },
      { range: "81-100", count: 0 },
    ];
    for (const v of allScores) {
      if (v.score <= 20) distribution[0].count++;
      else if (v.score <= 40) distribution[1].count++;
      else if (v.score <= 60) distribution[2].count++;
      else if (v.score <= 80) distribution[3].count++;
      else distribution[4].count++;
    }

    // --- Weekly / monthly averages ---
    const daysSinceWeekStart = Math.max(
      1,
      Math.ceil((now.getTime() - startOfWeek.getTime()) / 86_400_000),
    );
    const daysSinceMonthStart = Math.max(
      1,
      Math.ceil((now.getTime() - startOfMonth.getTime()) / 86_400_000),
    );

    return NextResponse.json({
      success: true,
      data: {
        user: {
          name: user?.name || null,
          email: user?.email || null,
          plan: user?.plan || "FREE",
          creditsRemaining: user?.credits || 0,
        },
        stats: {
          thisMonth: thisMonthCount,
          avgScore: Math.round(avgScoreThisMonth._avg.score || 0),
          validRate,
          totalValidated: totalCount,
        },
        validationsByDay,
        validationsByStatus: byStatusAll.map((s: { status: string; _count: number }) => ({
          status: s.status,
          count: s._count,
        })),
        scoreDistribution: distribution,
        recentActivity: recentValidations.map(
          (v: { email: string; score: number; status: string; createdAt: Date }) => ({
            action: "validation" as const,
            email: v.email,
            score: v.score,
            status: v.status,
            time: v.createdAt.toISOString(),
          }),
        ),
        trends: {
          todayCount,
          yesterdayCount,
          weekAvg: Math.round(weekCount / daysSinceWeekStart),
          monthAvg: Math.round(monthCount / daysSinceMonthStart),
        },
        recentJobs: recentJobsRaw.map(
          (j: {
            id: string;
            filename: string;
            status: string;
            totalEmails: number;
            processed: number;
            createdAt: Date;
          }) => ({
            ...j,
            createdAt: j.createdAt.toISOString(),
          }),
        ),
      },
    });
  } catch (error) {
    loggerApi.error({ err: error }, "Dashboard stats error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
