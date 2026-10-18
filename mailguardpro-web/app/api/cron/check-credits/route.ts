// Cron: Check low credits and notify users
// Runs daily (see vercel.json). Sends a low-credit warning email when a paid
// user's remaining credits drop to <= 20% of their plan allowance, matching
// the pricing FAQ ("notification when you reach 80% of your monthly limit").
// At most one warning per user every 7 days (deduped via the audit log).

import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cronAuth";
import { logError, loggerApi } from "@/lib/logger";
import { PLAN_INCLUDED_CREDITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import type { Plan } from "@/lib/rateLimits";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";

const LOW_CREDITS_RATIO = 0.2; // warn at <= 20% remaining (i.e. 80% used)
const WARNING_COOLDOWN_DAYS = 7;
// Ceiling for the DB query — PRO's 20% threshold is the highest of any plan.
const MAX_WARN_CREDITS = 10000;

export async function GET(req: NextRequest) {
  // Verify cron authorization with rate limiting and failed-attempt logging
  const { authorized, response } = await verifyCronRequest(req, "check-credits");
  if (!authorized) return response;

  try {
    loggerApi.info("[Cron] Starting low credits check...");

    // Paid, non-unlimited plans only: FREE gets what it gets, and BUSINESS
    // is unlimited (credit gate bypassed in /api/v1/validate).
    const candidates = await prisma.user.findMany({
      where: {
        credits: { lte: MAX_WARN_CREDITS },
        plan: { notIn: ["FREE", "BUSINESS"] },
      },
      select: {
        id: true,
        email: true,
        name: true,
        credits: true,
        plan: true,
      },
    });

    const lowCreditUsers = candidates.filter((user) => {
      const included = PLAN_INCLUDED_CREDITS[user.plan as Plan];
      return included > 0 && user.credits <= included * LOW_CREDITS_RATIO;
    });

    loggerApi.info(`[Cron] Found ${lowCreditUsers.length} users with low credits`);

    const cooldownStart = new Date(Date.now() - WARNING_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    const canSendEmail =
      Boolean(process.env.RESEND_API_KEY) && process.env.RESEND_API_KEY !== "re_placeholder";

    let usersNotified = 0;
    for (const user of lowCreditUsers) {
      // Dedupe: at most one warning per user per cooldown window
      const recentWarning = await prisma.auditLog.findFirst({
        where: {
          userId: user.id,
          action: AuditAction.CREDITS_LOW_WARNING,
          createdAt: { gte: cooldownStart },
        },
        select: { id: true },
      });
      if (recentWarning) continue;

      if (canSendEmail && user.email) {
        // Dynamic import: lib/resend throws at module init when
        // RESEND_API_KEY is missing in production, which would break the
        // build's page-data collection if imported statically.
        const { EMAIL_TEMPLATES, sendEmail } = await import("@/lib/resend");
        const template = EMAIL_TEMPLATES.lowCredits({
          name: user.name ?? undefined,
          credits: user.credits,
          plan: user.plan,
        });
        await sendEmail({ to: user.email, subject: template.subject, html: template.html });
      }

      await logAudit({
        userId: user.id,
        action: AuditAction.CREDITS_LOW_WARNING,
        resource: AuditResource.USER,
        metadata: {
          event: "LOW_CREDITS_WARNING",
          creditsRemaining: user.credits,
          plan: user.plan,
          emailSent: canSendEmail && Boolean(user.email),
        },
      });

      usersNotified++;
    }

    return NextResponse.json({
      success: true,
      usersNotified,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      context: "[Cron] Low credits check failed",
    });
    return NextResponse.json({ success: false, error: "Check failed" }, { status: 500 });
  }
}
