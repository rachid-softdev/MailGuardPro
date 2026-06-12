// API Route: Upload CSV pour traitement bulk
// POST /api/v1/validate/bulk

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { auth } from "@/lib/auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimitByPlan, Plan } from "@/lib/rateLimits";
import { processBulkUpload } from "@/services/bulkProcessor";

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const requestId = uuidv4();
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

    // Traiter le fichier avec correlation ID
    const result = await processBulkUpload(file, session.user.id, undefined, { requestId });

    const durationMs = Date.now() - startTime;

    if (!result.success || !result.jobId) {
      loggerApi.warn(
        {
          requestId,
          durationMs,
          errors: result.errors,
        },
        "Bulk upload validation failed",
      );
      return NextResponse.json({ success: false, errors: result.errors }, { status: 400 });
    }

    loggerApi.info(
      {
        requestId,
        jobId: result.jobId,
        totalEmails: result.totalEmails,
        durationMs,
      },
      "Bulk upload completed",
    );

    return NextResponse.json(
      {
        success: true,
        requestId,
        data: {
          jobId: result.jobId,
          totalEmails: result.totalEmails,
        },
      },
      { headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    loggerApi.error({ err: error, requestId }, "Bulk upload error");
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        requestId,
      },
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}
