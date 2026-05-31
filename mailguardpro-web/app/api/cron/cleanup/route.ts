// Cron: Cleanup old validation records
// Runs daily to remove old validations for free users (keep only 90 days)

import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cronAuth";
import { prisma } from "@/lib/prisma";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";

const RETENTION_DAYS = 90;

export async function GET(req: NextRequest) {
  // Verify cron authorization with rate limiting and failed-attempt logging
  const { authorized, response } = await verifyCronRequest(req, "cleanup");
  if (!authorized) return response;

  try {
    console.log("[Cron] Starting validation cleanup...");

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

    // Delete old validations for FREE users only
    // Keep all data for paid users
    const result = await prisma.validation.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
        user: {
          plan: "FREE",
        },
      },
    });

    console.log(`[Cron] Cleanup completed: ${result.count} records deleted`);

    // Also cleanup old bulk job data (completed jobs older than 30 days)
    const jobsCutoff = new Date();
    jobsCutoff.setDate(jobsCutoff.getDate() - 30);

    const jobsResult = await prisma.bulkJob.deleteMany({
      where: {
        status: "COMPLETED",
        completedAt: { lt: jobsCutoff },
      },
    });

    console.log(`[Cron] Bulk jobs cleanup: ${jobsResult.count} jobs deleted`);

    // Audit log
    await logAudit({
      action: AuditAction.USER_UPDATED,
      resource: AuditResource.USER,
      metadata: {
        event: "CLEANUP_VALIDATIONS",
        deletedValidations: result.count,
        deletedJobs: jobsResult.count,
      },
    });

    return NextResponse.json({
      success: true,
      deletedValidations: result.count,
      deletedJobs: jobsResult.count,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Cron] Cleanup failed:", error);
    return NextResponse.json({ success: false, error: "Cleanup failed" }, { status: 500 });
  }
}
