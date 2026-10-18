// Cron: Process expired account-deletion schedules
// Runs every 5 minutes to hard-delete accounts whose undo window has elapsed.
//
// Account deletion is scheduled by DELETE /api/v1/user (DeletionSchedule row)
// and can be cancelled via POST /api/v1/user/account/restore during the undo
// window. This executor performs the actual deletion:
//   - Validation rows are explicitly deleted (their User FK is SetNull, so they
//     would otherwise be orphaned — including the stored email data)
//   - ScheduledExport rows have no FK to User → explicit delete
//   - user.delete cascades Session/Account/ApiKey/BulkJob/Webhook/UserRole and
//     the DeletionSchedule row itself
//   - AuditLog rows are intentionally kept (no FK — legal/audit trail)

import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cronAuth";
import { logError, loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";

export async function GET(req: NextRequest) {
  // Verify cron authorization with rate limiting and failed-attempt logging
  const { authorized, response } = await verifyCronRequest(req, "process-deletions");
  if (!authorized) return response;

  try {
    loggerApi.info("[Cron] Starting account deletion processing...");

    // Cap the batch to bound the function runtime; remaining schedules are
    // picked up by the next run.
    const dueSchedules = await prisma.deletionSchedule.findMany({
      where: { expiresAt: { lte: new Date() } },
      select: { userId: true },
      take: 100,
    });

    let processed = 0;
    let failed = 0;

    for (const { userId } of dueSchedules) {
      try {
        await prisma.$transaction([
          prisma.validation.deleteMany({ where: { userId } }),
          prisma.scheduledExport.deleteMany({ where: { userId } }),
          prisma.user.delete({ where: { id: userId } }),
        ]);

        processed++;
        loggerApi.info({ userId }, "[Cron] Account deleted (deletion schedule expired)");

        // Audit trail is kept after deletion (AuditLog has no FK to User)
        try {
          await logAudit({
            userId,
            action: AuditAction.USER_DELETED,
            resource: AuditResource.USER,
            resourceId: userId,
            metadata: { reason: "deletion_schedule_expired" },
          });
        } catch {
          /* non-fatal */
        }
      } catch (error) {
        failed++;
        logError(error instanceof Error ? error : new Error(String(error)), {
          context: "[Cron] Failed to delete account",
          userId,
        });
      }
    }

    loggerApi.info(`[Cron] Deletion processing completed: ${processed} deleted, ${failed} failed`);

    return NextResponse.json({
      success: true,
      processed,
      failed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      context: "[Cron] Deletion processing failed",
    });
    return NextResponse.json(
      { success: false, error: "Deletion processing failed" },
      { status: 500 },
    );
  }
}
