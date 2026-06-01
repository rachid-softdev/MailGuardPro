// Cron: Sync disposable email domains
// Runs weekly to update the disposable domains list

import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cronAuth";
import { logError, loggerApi } from "@/lib/logger";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";
import { syncDisposableDomains } from "@/services/disposableChecker";

export async function GET(req: NextRequest) {
  // Verify cron authorization with rate limiting and failed-attempt logging
  const { authorized, response } = await verifyCronRequest(req, "sync-disposable");
  if (!authorized) return response;

  try {
    loggerApi.info("[Cron] Starting disposable domains sync...");

    const result = await syncDisposableDomains();

    loggerApi.info(`[Cron] Disposable domains sync completed: ${result.added} domains added`);

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
    logError(error instanceof Error ? error : new Error(String(error)), {
      context: "[Cron] Disposable domains sync failed",
    });
    return NextResponse.json({ success: false, error: "Sync failed" }, { status: 500 });
  }
}
