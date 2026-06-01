// API Route: List bulk jobs for the user
// GET /api/v1/bulk

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const bulkQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(req: NextRequest) {
  try {
    // Authentification
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(req.url);
    const queryValidation = bulkQuerySchema.safeParse({
      limit: searchParams.get("limit") || undefined,
      offset: searchParams.get("offset") || undefined,
    });

    if (!queryValidation.success) {
      loggerApi.warn({ errors: queryValidation.error.errors }, "Input validation failed");
      return NextResponse.json(
        {
          success: false,
          error: "Invalid query parameters",
        },
        { status: 400 },
      );
    }

    const { limit, offset } = queryValidation.data;

    // Récupérer les jobs
    const [jobs, total] = await Promise.all([
      prisma.bulkJob.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        select: {
          id: true,
          filename: true,
          status: true,
          totalEmails: true,
          processed: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      prisma.bulkJob.count({
        where: { userId: session.user.id },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: jobs,
      meta: {
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    loggerApi.error({ err: error }, "Bulk list error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
