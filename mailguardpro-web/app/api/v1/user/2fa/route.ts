// API Route: Two-factor authentication status
// GET /api/v1/user/2fa
//
// Returns whether TOTP is enabled for the authenticated user and how many
// one-time recovery codes remain.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { parseStoredRecoveryCodeHashes } from "@/lib/totp";

export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { twoFactorEnabled: true, twoFactorRecoveryCodes: true },
    });
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        enabled: user.twoFactorEnabled,
        recoveryCodesRemaining: user.twoFactorEnabled
          ? parseStoredRecoveryCodeHashes(user.twoFactorRecoveryCodes).length
          : 0,
      },
    });
  } catch (error) {
    loggerApi.error({ err: error }, "2FA status error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
