"use server";

import { prisma } from "@/lib/prisma";

export interface DashboardStats {
  thisMonth: number;
  avgScore: number;
  validRate: number;
  totalValidated: number;
  creditsRemaining: number;
  plan: string;
}

export interface RecentValidation {
  id: string;
  email: string;
  score: number;
  status: string;
  createdAt: Date;
}

export interface DashboardData {
  stats: DashboardStats;
  recentValidations: RecentValidation[];
  recentJobs: {
    id: string;
    filename: string;
    status: string;
    totalEmails: number;
    processed: number;
    createdAt: Date;
  }[];
}

function getStartOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const startOfMonth = getStartOfMonth();

  // Requête 1: Compter les validations ce mois
  const thisMonthCount = await prisma.validation.count({
    where: {
      userId,
      createdAt: { gte: startOfMonth },
    },
  });

  // Requête 2: Grouper par status ce mois
  const byStatus = await prisma.validation.groupBy({
    by: ["status"],
    where: {
      userId,
      createdAt: { gte: startOfMonth },
    },
    _count: true,
  });

  // Requête 3: Moyenne des scores ce mois
  const avgScoreResult = await prisma.validation.aggregate({
    where: {
      userId,
      createdAt: { gte: startOfMonth },
    },
    _avg: { score: true },
  });

  // Requête 4: Total toutes périodes
  const totalCount = await prisma.validation.count({
    where: { userId },
  });

  // Requête 5: Infos utilisateur (credits et plan)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true, plan: true },
  });

  // Requête 6: Validations récentes (10 dernières)
  const recentValidations = await prisma.validation.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      email: true,
      score: true,
      status: true,
      createdAt: true,
    },
  });

  // Requête 7: Jobs récents (5 derniers)
  const recentJobs = await prisma.bulkJob.findMany({
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
  });

  // Calculer le valid rate
  const validCount = byStatus.find((s: { status: string; _count: number }) => s.status === "valid")?._count || 0;
  const validRate = thisMonthCount > 0 ? Math.round((validCount / thisMonthCount) * 100) : 0;

  const stats: DashboardStats = {
    thisMonth: thisMonthCount,
    avgScore: Math.round(avgScoreResult._avg.score || 0),
    validRate,
    totalValidated: totalCount,
    creditsRemaining: user?.credits || 0,
    plan: user?.plan || "FREE",
  };

  return {
    stats,
    recentValidations: recentValidations as RecentValidation[],
    recentJobs: recentJobs as DashboardData["recentJobs"],
  };
}

export async function getUsageStats(userId: string) {
  const startOfMonth = getStartOfMonth();
  const startOfLastMonth = new Date(startOfMonth);
  startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);

  // This month
  const thisMonth = await prisma.validation.groupBy({
    by: ["status"],
    where: {
      userId,
      createdAt: { gte: startOfMonth },
    },
    _count: true,
  });

  // Last month
  const lastMonth = await prisma.validation.groupBy({
    by: ["status"],
    where: {
      userId,
      createdAt: {
        gte: startOfLastMonth,
        lt: startOfMonth,
      },
    },
    _count: true,
  });

  // All time
  const allTime = await prisma.validation.count({
    where: { userId },
  });

  const avgScoreThisMonth = await prisma.validation.aggregate({
    where: {
      userId,
      createdAt: { gte: startOfMonth },
    },
    _avg: { score: true },
  });

  const avgScoreAllTime = await prisma.validation.aggregate({
    where: { userId },
    _avg: { score: true },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true, plan: true, createdAt: true },
  });

  // Calculate next credit reset (first of next month)
  const now = new Date();
  const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return {
    thisMonth: {
      validations: thisMonth.reduce((acc: number, s: { _count: number }) => acc + s._count, 0),
      byStatus: thisMonth.reduce(
        (acc: Record<string, number>, s: { status: string; _count: number }) => {
          acc[s.status as keyof typeof acc] = s._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      avgScore: Math.round(avgScoreThisMonth._avg.score || 0),
    },
    lastMonth: {
      validations: lastMonth.reduce((acc: number, s: { _count: number }) => acc + s._count, 0),
      byStatus: lastMonth.reduce(
        (acc: Record<string, number>, s: { status: string; _count: number }) => {
          acc[s.status as keyof typeof acc] = s._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
    },
    total: {
      allTime,
      avgScore: Math.round(avgScoreAllTime._avg.score || 0),
    },
    plan: {
      name: user?.plan || "FREE",
      creditsRemaining: user?.credits || 0,
      nextResetDate: nextReset.toISOString(),
    },
  };
}
