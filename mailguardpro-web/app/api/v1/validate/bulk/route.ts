// API Route: Upload CSV pour traitement bulk
// POST /api/v1/validate/bulk

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processBulkUpload } from "@/services/bulkProcessor";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimitByPlan, Plan } from "@/lib/rateLimits";

export async function POST(req: NextRequest) {
  try {
    // Authentification requise
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    // Vérifier les crédits pour le bulk
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { credits: true, plan: true },
    });

    // Limite selon le plan
    const maxBatchSize = user?.plan === "PRO" || user?.plan === "BUSINESS" ? 100000 : 10000;

    // Rate limiting par plan
    const rateCheck = await checkRateLimitByPlan(
      session.user.id,
      (user?.plan as Plan) || "FREE",
      "bulk",
    );

    if (!rateCheck.success) {
      return NextResponse.json({
        success: false,
        error: `Rate limit exceeded. Max ${rateCheck.limit} bulk jobs per hour.`,
        retryAfter: rateCheck.resetAt,
      }, { status: 429 });
    }

    // Parser le multipart form
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    // Vérifier le type de fichier
    if (!file.name.endsWith(".csv")) {
      return NextResponse.json({ success: false, error: "File must be a CSV" }, { status: 400 });
    }

    // Traiter le fichier
    const result = await processBulkUpload(file, session.user.id);

    if (!result.success || !result.jobId) {
      return NextResponse.json({ success: false, errors: result.errors }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: {
        jobId: result.jobId,
        totalEmails: result.totalEmails,
      },
    });
  } catch (error) {
    console.error("[API] Bulk upload error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
