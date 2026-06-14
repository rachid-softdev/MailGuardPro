// API Route: Cancel pending account deletion
// POST /api/v1/user/account/restore

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export async function POST(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Find and delete the pending deletion schedule
    const schedule = await prisma.deletionSchedule.findUnique({
      where: { userId },
    });

    if (!schedule) {
      return NextResponse.json(
        { success: false, error: "No pending deletion schedule found" },
        { status: 404 },
      );
    }

    await prisma.deletionSchedule.delete({
      where: { userId },
    });

    return NextResponse.json({
      success: true,
      message: "Account deletion cancelled successfully",
    });
  } catch (error) {
    loggerApi.error({ err: error }, "Account restore error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
