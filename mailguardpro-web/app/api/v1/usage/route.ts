// API Route: Usage du compte
// GET /api/v1/usage

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    // Récupérer les infos utilisateur avec les compteurs
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        plan: true,
        credits: true,
        createdAt: true,
        _count: {
          select: {
            validations: true,
            bulkJobs: true,
            apiKeys: true,
            webhooks: true,
          },
        },
      },
    });

    // Compter les validations ce mois-ci
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const thisMonthValidations = await prisma.validation.count({
      where: {
        userId: session.user.id,
        createdAt: { gte: startOfMonth },
      },
    });

    // Statistiques des bulk jobs
    const bulkJobs = await prisma.bulkJob.findMany({
      where: { userId: session.user.id },
      select: {
        totalEmails: true,
        processed: true,
        status: true,
      },
    });

    const totalBulkEmails = bulkJobs.reduce((sum, job) => sum + job.totalEmails, 0);
    const totalProcessed = bulkJobs.reduce((sum, job) => sum + job.processed, 0);

    // Limites selon le plan
    const planLimits: Record<string, { credits: number; bulkMax: number }> = {
      FREE: { credits: 100, bulkMax: 0 },
      STARTER: { credits: 5000, bulkMax: 10000 },
      PRO: { credits: 50000, bulkMax: 100000 },
      BUSINESS: { credits: -1, bulkMax: -1 }, // Illimité
    };

    const limits = planLimits[user?.plan || "FREE"];

    return NextResponse.json({
      success: true,
      data: {
        plan: user?.plan || "FREE",
        credits: {
          remaining: user?.credits || 0,
          thisMonth: thisMonthValidations,
          included: limits.credits,
        },
        bulk: {
          totalEmails: totalBulkEmails,
          totalProcessed,
          maxBatch: limits.bulkMax,
        },
        apiKeys: user?._count.apiKeys || 0,
        webhooks: user?._count.webhooks || 0,
        memberSince: user?.createdAt,
      },
    });
  } catch (error) {
    console.error("[API] Usage error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
