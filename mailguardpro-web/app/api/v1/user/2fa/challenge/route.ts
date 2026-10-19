// API Route: Complete the two-factor challenge after sign-in
// POST /api/v1/user/2fa/challenge
//
// This endpoint deliberately does NOT use auth(): a session pending the 2FA
// challenge resolves as unauthenticated (see the session callback in
// lib/auth.ts). It resolves the device from the session cookie instead, checks
// a TOTP code (or a one-time recovery code), and marks the session verified so
// the app becomes usable on this device.

import { NextRequest, NextResponse } from "next/server";
import { decryptToken } from "@/lib/crypto";
import { validateCsrfOrigin } from "@/lib/csrf";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/redis";
import { parseJsonBody } from "@/lib/request";
import { getCurrentSessionToken } from "@/lib/sessionCookie";
import { getClientIp } from "@/lib/ssrf";
import { hashRecoveryCode, parseStoredRecoveryCodeHashes, verifyTotp } from "@/lib/totp";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";

const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_SECONDS = 300;

function noPendingChallenge() {
  return NextResponse.json(
    { success: false, error: "No pending two-factor challenge" },
    { status: 401 },
  );
}

export async function POST(req: NextRequest) {
  try {
    // CSRF protection
    const csrf = validateCsrfOrigin(req);
    if (!csrf.valid) {
      return NextResponse.json({ success: false, error: csrf.error }, { status: 403 });
    }

    const sessionToken = getCurrentSessionToken(req);
    if (!sessionToken) {
      return noPendingChallenge();
    }

    const row = await prisma.session.findUnique({
      where: { sessionToken },
      include: {
        user: {
          select: {
            id: true,
            isActive: true,
            twoFactorEnabled: true,
            twoFactorSecret: true,
            twoFactorRecoveryCodes: true,
          },
        },
      },
    });

    if (!row) {
      return noPendingChallenge();
    }
    // Mirror NextAuth: drop expired session rows instead of leaving them around
    if (row.expires.getTime() < Date.now()) {
      await prisma.session.delete({ where: { sessionToken } }).catch(() => {});
      return noPendingChallenge();
    }

    const { user } = row;
    if (!user.twoFactorEnabled || !user.twoFactorSecret || user.isActive === false) {
      return noPendingChallenge();
    }
    if (row.twoFactorVerifiedAt != null) {
      return NextResponse.json(
        { success: false, error: "Two-factor challenge already completed" },
        { status: 409 },
      );
    }

    const rateCheck = await checkRateLimit(
      `2fa:challenge:${user.id}`,
      MAX_ATTEMPTS,
      ATTEMPT_WINDOW_SECONDS,
    );
    if (!rateCheck.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many attempts. Please try again later.",
          retryAfter: rateCheck.resetAt,
        },
        { status: 429 },
      );
    }

    const { data: body, error: bodyError } = await parseJsonBody(req);
    if (bodyError) return bodyError;
    const { code, recoveryCode } = body as { code?: string; recoveryCode?: string };

    let valid = false;
    let usedRecoveryCode = false;
    let remainingRecoveryCodes: string[] | null = null;

    if (typeof recoveryCode === "string" && recoveryCode.length > 0) {
      const stored = parseStoredRecoveryCodeHashes(user.twoFactorRecoveryCodes);
      const hashed = hashRecoveryCode(recoveryCode);
      if (stored.includes(hashed)) {
        valid = true;
        usedRecoveryCode = true;
        remainingRecoveryCodes = stored.filter((entry) => entry !== hashed);
      }
    } else if (typeof code === "string" && code.length > 0) {
      valid = verifyTotp(decryptToken(user.twoFactorSecret), code);
    } else {
      return NextResponse.json({ success: false, error: "Code is required" }, { status: 400 });
    }

    if (!valid) {
      void logAudit({
        userId: user.id,
        action: AuditAction.USER_2FA_CHALLENGE_FAILED,
        resource: AuditResource.USER,
        ipAddress: getClientIp(req) !== "unknown" ? getClientIp(req) : undefined,
      });
      return NextResponse.json({ success: false, error: "Invalid code" }, { status: 401 });
    }

    await prisma.session.update({
      where: { sessionToken },
      data: { twoFactorVerifiedAt: new Date() },
    });

    // Recovery codes are one-time: consume the used one
    if (usedRecoveryCode && remainingRecoveryCodes) {
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorRecoveryCodes: JSON.stringify(remainingRecoveryCodes) },
      });
    }

    void logAudit({
      userId: user.id,
      action: AuditAction.USER_2FA_CHALLENGE_SUCCESS,
      resource: AuditResource.USER,
      metadata: { method: usedRecoveryCode ? "recovery_code" : "totp" },
      ipAddress: getClientIp(req) !== "unknown" ? getClientIp(req) : undefined,
    });

    return NextResponse.json({
      success: true,
      data: { recoveryCodesRemaining: remainingRecoveryCodes?.length ?? null },
    });
  } catch (error) {
    loggerApi.error({ err: error }, "2FA challenge error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
