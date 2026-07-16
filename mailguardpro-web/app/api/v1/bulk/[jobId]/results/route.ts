// API Route: Résultats paginés d'un job bulk
// GET /api/v1/bulk/[jobId]/results?page=1&limit=50&status=valid,invalid

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getBulkJobResults } from "@/services/bulkProcessor";

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
  status: z.string().optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  maxScore: z.coerce.number().min(0).max(100).optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;
    const { searchParams } = new URL(req.url);

    // Validation des query params
    // NOTE: searchParams.get() returns null (not undefined) when absent.
    // Zod's .optional() rejects null, so coerce absent params to undefined
    // so defaults apply and valid requests without filters don't 400.
    const filters = {
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      minScore: searchParams.get("minScore") ?? undefined,
      maxScore: searchParams.get("maxScore") ?? undefined,
    };

    const validated = querySchema.safeParse(filters);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: "Invalid query parameters" },
        { status: 400 },
      );
    }

    // Authentification
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    // Ownership check
    const job = await prisma.bulkJob.findFirst({
      where: { id: jobId, userId: session.user.id },
      select: { id: true },
    });
    if (!job) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    }

    // Parser les filtres
    const filterOptions = {
      status: validated.data.status?.split(","),
      minScore: validated.data.minScore,
      maxScore: validated.data.maxScore,
    };

    const results = await getBulkJobResults(
      jobId,
      session.user.id,
      validated.data.page,
      validated.data.limit,
      filterOptions,
    );

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error) {
    loggerApi.error({ err: error }, "Bulk results error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
