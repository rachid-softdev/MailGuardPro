// API Route: Delete a scheduled export
// DELETE /api/v1/exports/[id]

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const { id } = await params;

    const scheduled = await prisma.scheduledExport.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!scheduled) {
      return NextResponse.json(
        { success: false, error: "Scheduled export not found" },
        { status: 404 },
      );
    }

    if (scheduled.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: "Scheduled export not found" },
        { status: 404 },
      );
    }

    await prisma.scheduledExport.update({
      where: { id },
      data: { isActive: false },
    });

    loggerApi.info({ scheduledExportId: id }, "Scheduled export deactivated");

    return NextResponse.json({ success: true });
  } catch (error) {
    loggerApi.error({ err: error }, "Delete scheduled export error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
