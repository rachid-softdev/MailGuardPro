// API Route: Account deletion with undo support
// DELETE /api/v1/user — Schedule account deletion (5-second undo window)

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export async function DELETE(req: NextRequest) {
  try {
    // Authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    // CSRF protection
    const csrf = validateCsrfOrigin(req);
    if (!csrf.valid) {
      return NextResponse.json({ success: false, error: csrf.error }, { status: 403 });
    }

    const userId = session.user.id;
    const now = new Date();
    const undoExpiresAt = new Date(now.getTime() + 5000);

    // Check if a deletion schedule already exists
    const existing = await prisma.deletionSchedule.findUnique({
      where: { userId },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Account deletion already scheduled" },
        { status: 409 },
      );
    }

    // Schedule deletion (actual cleanup will happen after the undo window expires)
    await prisma.deletionSchedule.create({
      data: {
        userId,
        expiresAt: undoExpiresAt,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Account deletion scheduled. You have 5 seconds to undo.",
      undoable: true,
      undoExpiresAt: undoExpiresAt.toISOString(),
    });
  } catch (error) {
    loggerApi.error({ err: error }, "Account deletion scheduling error");
    return NextResponse.json(
      { success: false, error: "Failed to schedule account deletion" },
      { status: 500 },
    );
  }
}
