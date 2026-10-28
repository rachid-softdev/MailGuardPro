// API Route: Export validation history as CSV.
// POST /api/v1/exports?format=csv
// GET  /api/v1/exports — list legacy scheduled exports (read-only)
//
// XLSX/PDF history exports are not implemented. They are available from a
// completed bulk job, which has the full result set and original addresses.
// Scheduled exports have no runner yet, so creation is rejected instead of
// silently creating a job that never runs.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { sanitizeForCsv } from "@/lib/emailSanitizer";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimitByPlan, type Plan } from "@/lib/rateLimits";
import { getBulkJobEmailMaps } from "@/services/emailResolver";

const VALID_FORMATS = ["csv"] as const;
type ExportFormat = (typeof VALID_FORMATS)[number];

function csvCell(value: unknown): string {
  return sanitizeForCsv(String(value ?? ""));
}

function generateCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines: string[] = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row[header])).join(","));
  }
  return lines.join("\r\n");
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

    const { searchParams } = new URL(req.url);
    const rawFormat = searchParams.get("format") || "csv";

    if (!VALID_FORMATS.includes(rawFormat as ExportFormat)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Only CSV is available for history exports. Use a completed bulk job for XLSX or PDF.",
        },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const filters = body.filters || body; // support both { filters: {...} } and flat body

    if (body.schedule) {
      return NextResponse.json(
        { success: false, error: "Scheduled exports are not available yet." },
        { status: 501 },
      );
    }

    const where: any = { userId: session.user.id };

    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.search) {
      const search = String(filters.search).trim().toLowerCase();
      if (search.includes("@")) {
        const { hashEmail } = await import("@/lib/emailHash");
        where.emailHash = hashEmail(search);
      } else {
        where.email = { startsWith: search };
      }
    }
    if (filters?.domain) {
      where.email = {
        ...(where.email ?? {}),
        endsWith: `@${String(filters.domain).trim().toLowerCase()}`,
      };
    }
    if (filters?.dateFrom || filters?.dateTo) {
      const createdAt: Record<string, Date> = {};
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom);
        if (!Number.isNaN(from.getTime())) createdAt.gte = from;
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        if (!Number.isNaN(to.getTime())) {
          to.setUTCHours(23, 59, 59, 999);
          createdAt.lte = to;
        }
      }
      if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;
    }
    if (filters?.scoreMin || filters?.scoreMax) {
      const score: Record<string, number> = {};
      const min = parseInt(filters.scoreMin ?? "", 10);
      const max = parseInt(filters.scoreMax ?? "", 10);
      if (!Number.isNaN(min)) score.gte = Math.max(0, Math.min(100, min));
      if (!Number.isNaN(max)) score.lte = Math.max(0, Math.min(100, max));
      if (Object.keys(score).length > 0) where.score = score;
    }

    // Fetch one extra row so the response can say whether the export was
    // capped instead of silently returning a partial file.
    const exportLimit = 10000;
    const fetched = await prisma.validation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: exportLimit + 1,
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

    const truncated = fetched.length > exportLimit;
    const validations = truncated ? fetched.slice(0, exportLimit) : fetched;

    if (validations.length === 0) {
      return NextResponse.json(
        { success: false, error: "No validations found matching the filters" },
        { status: 404 },
      );
    }

    const jobIds = [
      ...new Set(
        validations.map((row) => row.bulkJobId).filter((jobId): jobId is string => Boolean(jobId)),
      ),
    ];
    const originalByJob = await getBulkJobEmailMaps(jobIds, session.user.id);

    const rows = validations.map(
      (v: {
        email: string;
        emailHash: string;
        bulkJobId: string | null;
        score: number;
        status: string;
        createdAt: Date;
        checksJson: unknown;
        processingTimeMs: number;
      }) => {
        const checks = v.checksJson as Record<string, unknown> | null;
        const original = v.bulkJobId ? originalByJob.get(v.bulkJobId)?.get(v.emailHash) : undefined;
        return {
          email: original ?? v.email,
          score: v.score,
          status: v.status,
          created_at: v.createdAt.toISOString(),
          format_valid: checks?.format ? (checks.format as Record<string, unknown>)?.passed : "",
          mx_valid: checks?.mx ? (checks.mx as Record<string, unknown>)?.passed : "",
          smtp_valid: checks?.smtp ? (checks.smtp as Record<string, unknown>)?.passed : "",
          disposable: checks?.disposable
            ? (checks.disposable as Record<string, unknown>)?.passed
            : "",
          catchall: checks?.catchAll ? (checks.catchAll as Record<string, unknown>)?.passed : "",
          generic: checks?.generic ? (checks.generic as Record<string, unknown>)?.passed : "",
          free_provider: checks?.freeProvider
            ? (checks.freeProvider as Record<string, unknown>)?.passed
            : "",
          dnsbl: checks?.dnsbl ? (checks.dnsbl as Record<string, unknown>)?.passed : "",
          spf_valid: checks?.spf ? (checks.spf as Record<string, unknown>)?.passed : "",
          dmarc_valid: checks?.dmarc ? (checks.dmarc as Record<string, unknown>)?.passed : "",
          processing_time_ms: v.processingTimeMs,
        };
      },
    );

    const csvContent = generateCsv(rows);

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="mailguard-export${truncated ? "-truncated" : ""}-${Date.now()}.csv"`,
        "X-Export-Truncated": truncated ? "true" : "false",
        "X-Export-Row-Limit": String(exportLimit),
      },
    });
  } catch (error) {
    loggerApi.error({ err: error }, "Export generation error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const schedules = await prisma.scheduledExport.findMany({
      where: { userId: session.user.id, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: schedules });
  } catch (error) {
    loggerApi.error({ err: error }, "List scheduled exports error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
