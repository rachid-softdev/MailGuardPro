// API Route: Restore a soft-deleted API key
// POST /api/v1/api-keys/[id]/restore

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify the key exists, is owned by user, and is soft-deleted
    const key = await prisma.apiKey.findFirst({
      where: {
        id,
        userId: session.user.id,
        deletedAt: { not: null },
      },
    });

    if (!key) {
      return NextResponse.json(
        { success: false, error: "Key not found or not deleted" },
        { status: 404 },
      );
    }

    const restored = await prisma.apiKey.update({
      where: { id },
      data: {
        deletedAt: null,
        restoredAt: new Date(),
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, data: restored });
  } catch (error) {
    loggerApi.error({ err: error }, "API key restore error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
