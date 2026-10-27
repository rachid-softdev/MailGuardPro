// Cron: refill the monthly validation allowance for paid plans.
// Runs daily (see vercel.json). Monthly plans are also refilled by the Stripe
// invoice webhook; this cron covers annual plans (monthly refills) and any
// payment event that was missed. The refill itself is idempotent.

import { NextRequest, NextResponse } from "next/server";
import { resetDueCredits } from "@/lib/credits";
import { verifyCronRequest } from "@/lib/cronAuth";
import { logError, loggerApi } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const { authorized, response } = await verifyCronRequest(req, "reset-credits");
  if (!authorized) return response;

  try {
    loggerApi.info("[Cron] Starting monthly credit reset...");
    const result = await resetDueCredits();

    loggerApi.info(
      { scanned: result.scanned, reset: result.reset },
      "[Cron] Monthly credit reset complete",
    );

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      context: "[Cron] Monthly credit reset failed",
    });
    return NextResponse.json({ success: false, error: "Reset failed" }, { status: 500 });
  }
}
