import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cronAuth";
import { prisma } from "@/lib/prisma";

const AUDIT_RETENTION_DAYS = 90;

export async function GET(req: NextRequest) {
  // Verify cron authorization with rate limiting and failed-attempt logging
  const { authorized, response } = await verifyCronRequest(req, "cleanup-audit-logs");
  if (!authorized) return response;

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - AUDIT_RETENTION_DAYS);

    const result = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoffDate } },
    });

    console.log(`[Cron] Audit log cleanup: ${result.count} records deleted`);

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Cron] Audit log cleanup failed:", error);
    return NextResponse.json({ success: false, error: "Cleanup failed" }, { status: 500 });
  }
}
