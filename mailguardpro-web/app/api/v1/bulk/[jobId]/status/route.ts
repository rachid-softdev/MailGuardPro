// API Route: Statut d'un job bulk
// GET /api/v1/bulk/[jobId]/status

import { auth } from "@/lib/auth";
import { getBulkJobStatus } from "@/services/bulkProcessor";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
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
    const status = await getBulkJobStatus(jobId);

    if (!status) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    }

    // Vérifier que l'utilisateur est propriétaire du job
    // Note: à implémenter avec une vérification userId

    return NextResponse.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error("[API] Bulk status error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
