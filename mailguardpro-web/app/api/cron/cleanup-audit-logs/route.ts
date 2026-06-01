import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cronAuth";
import { logError, logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const BATCH_SIZE = 1000;
const DELAY_BETWEEN_BATCHES_MS = 100;
const MAX_BATCHES = 1000; // Safety limit: max 1M records per cleanup run
const RETENTION_DAYS = 90;

export async function GET(req: NextRequest) {
  // Verify cron authorization with rate limiting and failed-attempt logging
  const { authorized, response } = await verifyCronRequest(req, "cleanup-audit-logs");
  if (!authorized) return response;

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

    let deletedTotal = 0;
    let batchCount = 0;
    let hasMore = true;

    while (hasMore && batchCount < MAX_BATCHES) {
      // Find a batch of IDs to delete
      const batch = await prisma.auditLog.findMany({
        where: { createdAt: { lt: cutoff } },
        take: BATCH_SIZE,
        select: { id: true },
      });

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      // Delete this batch
      const { count } = await prisma.auditLog.deleteMany({
        where: { id: { in: batch.map((r) => r.id) } },
      });

      deletedTotal += count;
      batchCount++;

      // Small delay to reduce contention
      if (batch.length === BATCH_SIZE) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
      }
    }

    logger.info(
      {
        deletedTotal,
        batchesRun: batchCount,
        retentionDays: RETENTION_DAYS,
      },
      "AuditLog cleanup completed",
    );

    return NextResponse.json({
      success: true,
      deleted: deletedTotal,
      batches: batchCount,
    });
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      context: "[Cron] Audit log cleanup failed",
    });
    return NextResponse.json({ success: false, error: "Cleanup failed" }, { status: 500 });
  }
}
