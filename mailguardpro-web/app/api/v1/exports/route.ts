// API Route: Export validations and manage scheduled exports
// POST /api/v1/exports?format=csv|xlsx|pdf — generate or schedule an export
// GET  /api/v1/exports — list scheduled exports for the user

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const VALID_FORMATS = ["csv", "xlsx", "pdf"] as const;
type ExportFormat = (typeof VALID_FORMATS)[number];

const FORMAT_MIME_TYPES: Record<ExportFormat, string> = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

const FORMAT_EXTENSIONS: Record<ExportFormat, string> = {
  csv: "csv",
  xlsx: "csv", // fallback: XLSX not yet supported
  pdf: "csv", // fallback: PDF not yet supported
};

function escapeCsv(value: unknown): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines: string[] = [headers.map(escapeCsv).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsv(row[h])).join(","));
  }
  return lines.join("\r\n");
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(req.url);
    const rawFormat = searchParams.get("format") || "csv";

    if (!VALID_FORMATS.includes(rawFormat as ExportFormat)) {
      return NextResponse.json(
        { success: false, error: `Invalid format. Must be one of: ${VALID_FORMATS.join(", ")}` },
        { status: 400 },
      );
    }

    const format = rawFormat as ExportFormat;

    const body = await req.json().catch(() => ({}));
    const filters = body.filters || body; // support both { filters: {...} } and flat body
    const schedule = body.schedule;

    // If schedule is provided, create a scheduled export record
    if (schedule) {
      if (!["daily", "weekly", "monthly"].includes(schedule.frequency)) {
        return NextResponse.json(
          { success: false, error: "schedule.frequency must be daily, weekly, or monthly" },
          { status: 400 },
        );
      }

      const now = new Date();
      let nextRunAt: Date;
      switch (schedule.frequency) {
        case "daily":
          nextRunAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          break;
        case "weekly":
          nextRunAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          break;
        case "monthly":
          nextRunAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          nextRunAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      }

      const scheduled = await prisma.scheduledExport.create({
        data: {
          userId: session.user.id,
          scope: "validations",
          format,
          frequency: schedule.frequency,
          filters: filters || {},
          nextRunAt,
        },
      });

      loggerApi.info(
        { scheduledExportId: scheduled.id, format, frequency: schedule.frequency },
        "Scheduled export created",
      );

      return NextResponse.json({ success: true, data: scheduled }, { status: 201 });
    }

    // No schedule — generate export immediately
    const where: any = { userId: session.user.id };

    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.search) {
      where.email = { startsWith: filters.search.toLowerCase() };
    }
    if (filters?.dateFrom) {
      where.createdAt = { ...(where.createdAt || {}), gte: new Date(filters.dateFrom) };
    }
    if (filters?.dateTo) {
      where.createdAt = { ...(where.createdAt || {}), lte: new Date(filters.dateTo) };
    }

    const validations = await prisma.validation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10000, // safety limit
      select: {
        id: true,
        email: true,
        score: true,
        status: true,
        createdAt: true,
        checksJson: true,
        processingTimeMs: true,
      },
    });

    if (validations.length === 0) {
      return NextResponse.json(
        { success: false, error: "No validations found matching the filters" },
        { status: 404 },
      );
    }

    const rows = validations.map(
      (v: {
        email: string;
        score: number;
        status: string;
        createdAt: Date;
        checksJson: unknown;
        processingTimeMs: number;
      }) => {
        const checks = v.checksJson as Record<string, unknown> | null;
        return {
          email: v.email,
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
    const buffer = Buffer.from(csvContent, "utf-8");

    const actualFormat: ExportFormat = format === "xlsx" || format === "pdf" ? "csv" : format;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": FORMAT_MIME_TYPES[actualFormat],
        "Content-Disposition": `attachment; filename="mailguard-export-${Date.now()}.${FORMAT_EXTENSIONS[format]}"`,
        "X-Export-Fallback": format !== "csv" ? `true; original_format=${format}` : "false",
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
