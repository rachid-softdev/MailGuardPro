// API Route: Statut d'un job bulk
// GET /api/v1/bulk/[jobId]/status

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loggerApi } from "@/lib/logger";
import { getBulkJobStatus } from "@/services/bulkProcessor";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;

    // Authentification
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    // Récupérer le statut
    const status = await getBulkJobStatus(jobId, session.user.id);

    if (!status) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: status,
    });
  } catch (error) {
    loggerApi.error({ err: error }, "Bulk status error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
