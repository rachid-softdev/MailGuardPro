// API Route: Résultats paginés d'un job bulk
// GET /api/v1/bulk/[jobId]/results?page=1&limit=50&status=valid,invalid

import { auth } from "@/lib/auth";
import { getBulkJobResults } from "@/services/bulkProcessor";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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
    const filters = {
      page: searchParams.get("page"),
      limit: searchParams.get("limit"),
      status: searchParams.get("status"),
      minScore: searchParams.get("minScore"),
      maxScore: searchParams.get("maxScore"),
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

    // Parser les filtres
    const filterOptions = {
      status: validated.data.status?.split(","),
      minScore: validated.data.minScore,
      maxScore: validated.data.maxScore,
    };

    const results = await getBulkJobResults(
      jobId,
      validated.data.page,
      validated.data.limit,
      filterOptions,
    );

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error("[API] Bulk results error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
