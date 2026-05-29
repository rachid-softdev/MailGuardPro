// Cron: Check low credits and notify users
// Runs daily to check users with low credits and potentially notify them

import { verifyCronRequest } from "@/lib/cronAuth";
import { prisma } from "@/lib/prisma";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";
import { NextRequest, NextResponse } from "next/server";

const LOW_CREDITS_THRESHOLD = 10;

export async function GET(req: NextRequest) {
  // Verify cron authorization with rate limiting and failed-attempt logging
  const { authorized, response } = await verifyCronRequest(req, "check-credits");
  if (!authorized) return response;

  try {
    console.log("[Cron] Starting low credits check...");

    // Find users with low credits (but not free plan, they get what they get)
    const usersWithLowCredits = await prisma.user.findMany({
      where: {
        credits: { lte: LOW_CREDITS_THRESHOLD },
        plan: { not: "FREE" },
      },
      select: {
        id: true,
        email: true,
        credits: true,
        plan: true,
      },
    });

    console.log(`[Cron] Found ${usersWithLowCredits.length} users with low credits`);

    // In production, this would send emails via Resend
    // For now, just log and return the list
    if (process.env.NODE_ENV === "production") {
      for (const user of usersWithLowCredits) {
        console.log(`[Cron] User ${user.id} has ${user.credits} credits left (plan: ${user.plan})`);

        // Log for potential email sending
        await logAudit({
          userId: user.id,
          action: AuditAction.CREDITS_LOW_WARNING,
          resource: AuditResource.USER,
          metadata: {
            event: "LOW_CREDITS_WARNING",
            creditsRemaining: user.credits,
            plan: user.plan,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      usersNotified: usersWithLowCredits.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Cron] Low credits check failed:", error);
    return NextResponse.json({ success: false, error: "Check failed" }, { status: 500 });
  }
}
