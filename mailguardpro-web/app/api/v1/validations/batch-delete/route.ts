// API Route: Delete a selection of validation history rows.
// POST /api/v1/validations/batch-delete

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimitByPlan, type Plan } from "@/lib/rateLimits";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(1000),
});

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
      "delete",
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

    const result = await prisma.validation.deleteMany({
      where: {
        userId: session.user.id,
        id: { in: parsed.data.ids },
      },
    });

    // Destructive batch operations are auditable. The ID list itself can be
    // large, so record the requested count rather than every identifier.
    await logAudit({
      userId: session.user.id,
      action: AuditAction.VALIDATION_DELETED,
      resource: AuditResource.VALIDATION,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: req.headers.get("user-agent") ?? undefined,
      metadata: {
        requested: parsed.data.ids.length,
        deleted: result.count,
      },
    });

    return NextResponse.json({
      success: true,
      data: { deleted: result.count },
    });
  } catch (error) {
    loggerApi.error({ err: error }, "Batch delete validations error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
