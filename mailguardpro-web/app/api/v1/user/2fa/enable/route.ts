// API Route: Confirm two-factor authentication enrollment
// POST /api/v1/user/2fa/enable
//
// Confirms the pending secret with a valid TOTP code, enables 2FA, and returns
// the one-time recovery codes (shown to the user only once). The current device
// is marked verified; every other session must solve the challenge for the new
// secret on its next use.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { decryptToken } from "@/lib/crypto";
import { validateCsrfOrigin } from "@/lib/csrf";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/redis";
import { parseJsonBody } from "@/lib/request";
import { getCurrentSessionToken } from "@/lib/sessionCookie";
import { generateRecoveryCodes, hashRecoveryCode, verifyTotp } from "@/lib/totp";
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
      `2fa:enable:${session.user.id}`,
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
    const { code } = body as { code?: string };
    if (!code || typeof code !== "string") {
      return NextResponse.json({ success: false, error: "Code is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { twoFactorEnabled: true, twoFactorSecret: true },
    });
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }
    if (user.twoFactorEnabled) {
      return NextResponse.json(
        { success: false, error: "Two-factor authentication is already enabled" },
        { status: 400 },
      );
    }
    if (!user.twoFactorSecret) {
      return NextResponse.json(
        { success: false, error: "Start two-factor setup first" },
        { status: 400 },
      );
    }

    const valid = verifyTotp(decryptToken(user.twoFactorSecret), code);
    if (!valid) {
      return NextResponse.json({ success: false, error: "Invalid code" }, { status: 400 });
    }

    const recoveryCodes = generateRecoveryCodes();
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        twoFactorEnabled: true,
        twoFactorRecoveryCodes: JSON.stringify(recoveryCodes.map(hashRecoveryCode)),
      },
    });

    // Keep this device signed in; force every other session through the
    // challenge (they now need a code for the new secret).
    const currentToken = getCurrentSessionToken(req);
    if (currentToken) {
      await prisma.session.updateMany({
        where: { userId: session.user.id, sessionToken: { not: currentToken } },
        data: { twoFactorVerifiedAt: null },
      });
      await prisma.session.updateMany({
        where: { userId: session.user.id, sessionToken: currentToken },
        data: { twoFactorVerifiedAt: new Date() },
      });
    }

    void logAudit({
      userId: session.user.id,
      action: AuditAction.USER_2FA_ENABLED,
      resource: AuditResource.USER,
    });

    return NextResponse.json({ success: true, data: { recoveryCodes } });
  } catch (error) {
    loggerApi.error({ err: error }, "2FA enable error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
