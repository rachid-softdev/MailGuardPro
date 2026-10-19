// API Route: Start two-factor authentication enrollment
// POST /api/v1/user/2fa/setup
//
// Generates a fresh TOTP secret, stores it encrypted at rest, and returns the
// secret plus its otpauth:// URI so the user can add it to an authenticator
// app. Enrollment truly takes effect only after POST /api/v1/user/2fa/enable
// confirms a valid code (the pending secret alone changes nothing).

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { encryptToken } from "@/lib/crypto";
import { validateCsrfOrigin } from "@/lib/csrf";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/redis";
import { buildOtpAuthUri, generateTotpSecret } from "@/lib/totp";

const SETUP_RATE_LIMIT = 10;
const SETUP_RATE_WINDOW_SECONDS = 300;

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
      `2fa:setup:${session.user.id}`,
      SETUP_RATE_LIMIT,
      SETUP_RATE_WINDOW_SECONDS,
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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, twoFactorEnabled: true },
    });
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }
    if (user.twoFactorEnabled) {
      return NextResponse.json(
        {
          success: false,
          error: "Two-factor authentication is already enabled. Disable it first.",
        },
        { status: 400 },
      );
    }

    const secret = generateTotpSecret();
    await prisma.user.update({
      where: { id: session.user.id },
      data: { twoFactorSecret: encryptToken(secret) },
    });

    return NextResponse.json({
      success: true,
      data: {
        secret,
        otpauthUri: buildOtpAuthUri({
          secret,
          account: user.email ?? session.user.email ?? session.user.id,
        }),
      },
    });
  } catch (error) {
    loggerApi.error({ err: error }, "2FA setup error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
