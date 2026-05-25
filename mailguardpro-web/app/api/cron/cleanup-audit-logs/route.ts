import { prisma } from "@/lib/prisma";
import { timingSafeEqual } from "@/lib/timingSafe";
import { NextRequest, NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;
const AUDIT_RETENTION_DAYS = 90;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${CRON_SECRET ?? ""}`;
  if (
    !timingSafeEqual(authHeader ?? "", expected) &&
    process.env.NODE_ENV === "production"
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - AUDIT_RETENTION_DAYS);

    const result = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoffDate } },
    });

    console.log(
      `[Cron] Audit log cleanup: ${result.count} records deleted`,
    );

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Cron] Audit log cleanup failed:", error);
    return NextResponse.json(
      { success: false, error: "Cleanup failed" },
      { status: 500 },
    );
  }
}
