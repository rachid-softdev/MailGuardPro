// Cron: Sync disposable email domains
// Runs weekly to update the disposable domains list

import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";
import { syncDisposableDomains } from "@/services/disposableChecker";
import { timingSafeEqual } from "@/lib/timingSafe";
import { NextRequest, NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  // Verify cron authorization
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${CRON_SECRET ?? ""}`;
  if (!timingSafeEqual(authHeader ?? "", expected) && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[Cron] Starting disposable domains sync...");

    const result = await syncDisposableDomains();

    console.log(`[Cron] Disposable domains sync completed: ${result.added} domains added`);

    // Audit log
    await logAudit({
      action: AuditAction.USER_UPDATED, // Using existing action for system events
      resource: AuditResource.USER, // System-level event
      metadata: {
        event: "DISPOSABLE_DOMAINS_SYNC",
        added: result.added,
      },
    });

    return NextResponse.json({
      success: true,
      added: result.added,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Cron] Disposable domains sync failed:", error);
    return NextResponse.json({ success: false, error: "Sync failed" }, { status: 500 });
  }
}
