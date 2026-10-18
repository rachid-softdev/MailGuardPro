// API Route: Usage du compte
// GET /api/v1/usage

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loggerApi } from "@/lib/logger";
import { PLAN_BULK_MAX_ROWS, PLAN_INCLUDED_CREDITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import type { Plan } from "@/lib/rateLimits";

export async function GET(_req: NextRequest) {
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
            // Soft-deleted rows must not be counted (deletedAt set on revoke/delete
            // with the 5s undo window — see useUndoDelete).
            apiKeys: { where: { deletedAt: null } },
            webhooks: { where: { deletedAt: null } },
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

    const totalBulkEmails = bulkJobs.reduce(
      (sum: number, job: { totalEmails: number }) => sum + job.totalEmails,
      0,
    );
    const totalProcessed = bulkJobs.reduce(
      (sum: number, job: { processed: number }) => sum + job.processed,
      0,
    );

    // Limites selon le plan — source unique : lib/plans.ts
    const plan = (user?.plan as Plan) || "FREE";
    const included = PLAN_INCLUDED_CREDITS[plan] ?? PLAN_INCLUDED_CREDITS.FREE;
    const bulkMax = PLAN_BULK_MAX_ROWS[plan] ?? PLAN_BULK_MAX_ROWS.FREE;

    return NextResponse.json({
      success: true,
      data: {
        plan,
        credits: {
          remaining: user?.credits || 0,
          thisMonth: thisMonthValidations,
          included,
        },
        bulk: {
          totalEmails: totalBulkEmails,
          totalProcessed,
          // -1 = unlimited (API contract, mirrors credits.included)
          maxBatch: plan === "BUSINESS" ? -1 : bulkMax,
        },
        apiKeys: user?._count.apiKeys || 0,
        webhooks: user?._count.webhooks || 0,
        memberSince: user?.createdAt,
      },
    });
  } catch (error) {
    loggerApi.error({ err: error }, "Usage error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
