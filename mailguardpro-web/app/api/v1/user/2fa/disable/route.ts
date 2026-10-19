// API Route: Disable two-factor authentication
// POST /api/v1/user/2fa/disable
//
// Requires a valid TOTP code or one of the recovery codes. Clears the secret
// and the recovery codes; the 2FA gate is lifted on every session immediately.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { decryptToken } from "@/lib/crypto";
import { validateCsrfOrigin } from "@/lib/csrf";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/redis";
import { parseJsonBody } from "@/lib/request";
import { hashRecoveryCode, parseStoredRecoveryCodeHashes, verifyTotp } from "@/lib/totp";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";

const VERIFY_RATE_LIMIT = 10;
const VERIFY_RATE_WINDOW_SECONDS = 300;

export async function POST(req: NextRequest) {
  try {
    // CSRF protection
    const csrf = validateCsrfOrigin(req);
    if (!csrf.valid) {
      return NextResponse.json({ success: false, error: csrf.error }, { status: 403 });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const rateCheck = await checkRateLimit(
      `2fa:disable:${session.user.id}`,
      VERIFY_RATE_LIMIT,
      VERIFY_RATE_WINDOW_SECONDS,
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

    if (
      (typeof code !== "string" || code.length === 0) &&
      (typeof recoveryCode !== "string" || recoveryCode.length === 0)
    ) {
      return NextResponse.json({ success: false, error: "Code is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorRecoveryCodes: true,
      },
    });
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      return NextResponse.json(
        { success: false, error: "Two-factor authentication is not enabled" },
        { status: 400 },
      );
    }

    let valid = false;
    if (typeof recoveryCode === "string" && recoveryCode.length > 0) {
      const hashed = hashRecoveryCode(recoveryCode);
      valid = parseStoredRecoveryCodeHashes(user.twoFactorRecoveryCodes).includes(hashed);
    } else if (typeof code === "string" && code.length > 0) {
      valid = verifyTotp(decryptToken(user.twoFactorSecret), code);
    }

    if (!valid) {
      return NextResponse.json({ success: false, error: "Invalid code" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorRecoveryCodes: null,
      },
    });

    void logAudit({
      userId: session.user.id,
      action: AuditAction.USER_2FA_DISABLED,
      resource: AuditResource.USER,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    loggerApi.error({ err: error }, "2FA disable error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
