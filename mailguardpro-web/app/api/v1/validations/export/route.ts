// API Route: Export a selection of validation history rows.
// POST /api/v1/validations/export  { ids: string[] }
//
// Bulk rows are resolved back to the addresses the user uploaded (outbox
// mapping); single-address rows stay masked because no original is retained.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { sanitizeForCsv } from "@/lib/emailSanitizer";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimitByPlan, type Plan } from "@/lib/rateLimits";
import { getBulkJobEmailMaps } from "@/services/emailResolver";

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(1000),
});

const COLUMNS = [
  "email",
  "score",
  "status",
  "created_at",
  "format_valid",
  "mx_valid",
  "smtp_valid",
  "disposable",
  "catchall",
  "generic",
  "free_provider",
  "dnsbl",
  "spf_valid",
  "dmarc_valid",
  "processing_time_ms",
] as const;

function csvCell(value: unknown): string {
  return sanitizeForCsv(String(value ?? ""));
}

export async function POST(req: NextRequest) {
  try {
    const csrf = validateCsrfOrigin(req);
    if (!csrf.valid) {
      return NextResponse.json({ success: false, error: csrf.error }, { status: 403 });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const rateCheck = await checkRateLimitByPlan(
      session.user.id,
      (session.user.plan as Plan) || "FREE",
      "export",
    );
    if (!rateCheck.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Rate limit exceeded. Please try again later.",
          retryAfter: rateCheck.resetAt,
        },
        { status: 429 },
      );
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "ids must be an array of 1–1000 validation IDs" },
        { status: 400 },
      );
    }

    const validations = await prisma.validation.findMany({
      where: {
        userId: session.user.id,
        id: { in: parsed.data.ids },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        emailHash: true,
        bulkJobId: true,
        score: true,
        status: true,
        createdAt: true,
        checksJson: true,
        processingTimeMs: true,
      },
    });

    if (validations.length === 0) {
      return NextResponse.json(
        { success: false, error: "No validations found for the selected rows" },
        { status: 404 },
      );
    }

    const jobIds = [
      ...new Set(
        validations.map((row) => row.bulkJobId).filter((jobId): jobId is string => Boolean(jobId)),
      ),
    ];
    const originalByJob = await getBulkJobEmailMaps(jobIds, session.user.id);

    const lines = [COLUMNS.join(",")];
    for (const row of validations) {
      const checks = row.checksJson as Record<string, { passed?: boolean }> | null;
      const original = row.bulkJobId
        ? originalByJob.get(row.bulkJobId)?.get(row.emailHash)
        : undefined;
      const values: Record<(typeof COLUMNS)[number], unknown> = {
        email: original ?? row.email,
        score: row.score,
        status: row.status,
        created_at: row.createdAt.toISOString(),
        format_valid: checks?.format?.passed,
        mx_valid: checks?.mx?.passed,
        smtp_valid: checks?.smtp?.passed,
        disposable: checks?.disposable?.passed,
        catchall: checks?.catchAll?.passed,
        generic: checks?.generic?.passed,
        free_provider: checks?.freeProvider?.passed,
        dnsbl: checks?.dnsbl?.passed,
        spf_valid: checks?.spf?.passed,
        dmarc_valid: checks?.dmarc?.passed,
        processing_time_ms: row.processingTimeMs,
      };
      lines.push(COLUMNS.map((column) => csvCell(values[column])).join(","));
    }

    return new NextResponse(lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="mailguard-history-${Date.now()}.csv"`,
      },
    });
  } catch (error) {
    loggerApi.error({ err: error }, "Batch export validations error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
