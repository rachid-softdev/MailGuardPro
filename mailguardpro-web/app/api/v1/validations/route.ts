// API Route: Historique des validations
// GET /api/v1/validations

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hashEmail } from "@/lib/emailHash";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = new Set(["valid", "invalid", "risky", "unknown", "pending"]);

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1"), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20"), 1), 100);
    const status = searchParams.get("status");
    const search = searchParams.get("search")?.trim().toLowerCase();
    const domain = searchParams.get("domain")?.trim().toLowerCase();
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const scoreMin = searchParams.get("scoreMin");
    const scoreMax = searchParams.get("scoreMax");

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = { userId: session.user.id };
    if (status && VALID_STATUSES.has(status)) {
      where.status = status;
    }
    if (search) {
      // Stored addresses are masked, so a full address must be looked up by
      // its salted hash. A partial local part can still use the masked prefix.
      if (search.includes("@")) {
        where.emailHash = hashEmail(search);
      } else {
        where.email = { startsWith: search };
      }
    }
    if (domain) {
      where.email = {
        ...(where.email ?? {}),
        endsWith: `@${domain}`,
      };
    }
    if (dateFrom || dateTo) {
      const createdAt: Record<string, Date> = {};
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (!Number.isNaN(from.getTime())) createdAt.gte = from;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        if (!Number.isNaN(to.getTime())) {
          // The UI sends a date; include the whole selected day.
          to.setUTCHours(23, 59, 59, 999);
          createdAt.lte = to;
        }
      }
      if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;
    }
    if (scoreMin || scoreMax) {
      const score: Record<string, number> = {};
      const min = parseInt(scoreMin || "", 10);
      const max = parseInt(scoreMax || "", 10);
      if (!Number.isNaN(min)) score.gte = Math.max(0, Math.min(100, min));
      if (!Number.isNaN(max)) score.lte = Math.max(0, Math.min(100, max));
      if (Object.keys(score).length > 0) where.score = score;
    }

    // Fetch validations
    const [validations, total] = await Promise.all([
      prisma.validation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          score: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.validation.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: validations,
      meta: {
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    loggerApi.error({ err: error }, "Validations list error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
