// API Route: Upload CSV pour traitement bulk
// POST /api/v1/validate/bulk

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimitByPlan, Plan } from "@/lib/rateLimits";
import { processBulkUpload } from "@/services/bulkProcessor";

export async function POST(req: NextRequest) {
  try {
    // CSRF protection
    const csrf = validateCsrfOrigin(req);
    if (!csrf.valid) {
      return NextResponse.json({ success: false, error: csrf.error }, { status: 403 });
    }

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
    // Rate limiting par plan
    const rateCheck = await checkRateLimitByPlan(
      session.user.id,
      (user?.plan as Plan) || "FREE",
      "bulk",
    );

    if (!rateCheck.success) {
      return NextResponse.json(
        {
          success: false,
          error: `Rate limit exceeded. Max ${rateCheck.limit} bulk jobs per hour.`,
          retryAfter: rateCheck.resetAt,
        },
        { status: 429 },
      );
    }

    // Parser le multipart form
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    // Vérifier le type de fichier (extension + MIME type)
    const isCsvExtension = file.name.toLowerCase().endsWith(".csv");
    const isCsvMime =
      file.type === "text/csv" || file.type === "application/csv" || file.type === "";
    // Note: file.type can be empty string in some environments (e.g., local dev)
    if (!isCsvExtension || (!isCsvMime && file.type !== "")) {
      return NextResponse.json(
        { success: false, error: "File must be a CSV file" },
        { status: 400 },
      );
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
    loggerApi.error({ err: error }, "Bulk upload error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
