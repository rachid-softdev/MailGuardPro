// API Route: Get export data for client-side PDF generation
// GET /api/v1/bulk/[jobId]/export-data

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const { jobId } = await params;

    // Verify ownership
    const job = await prisma.bulkJob.findFirst({
      where: { id: jobId, userId: session.user.id },
    });

    if (!job) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    }

    // Regression #5: /export-data feeds client-side PDF generation, a PRO+
    // feature. Enforce the plan gate here so it cannot be bypassed client-side.
    const exportUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    });
    const PLAN_ORDER = ["FREE", "STARTER", "PRO", "BUSINESS"];
    const userPlanIndex = PLAN_ORDER.indexOf((exportUser?.plan as string) || "FREE");
    const requiredPlanIndex = PLAN_ORDER.indexOf("PRO");
    if (userPlanIndex < requiredPlanIndex) {
      return NextResponse.json(
        {
          success: false,
          error: "Upgrade required",
          requiredPlan: "PRO",
          currentPlan: exportUser?.plan,
        },
        { status: 403 },
      );
    }

    // Get all results
    const results = await prisma.validation.findMany({
      where: { bulkJobId: jobId },
      select: {
        email: true,
        score: true,
        status: true,
        checksJson: true,
      },
    });

    // Calculate stats
    const valid = results.filter((r: { status: string }) => r.status === "valid").length;
    const invalid = results.filter((r: { status: string }) => r.status === "invalid").length;
    const risky = results.filter((r: { status: string }) => r.status === "risky").length;
    const unknown = results.filter((r: { status: string }) => r.status === "unknown").length;

    const avgScore =
      results.length > 0
        ? Math.round(
            results.reduce((sum: number, r: { score: number }) => sum + r.score, 0) /
              results.length,
          )
        : 0;

    const disposable = results.filter(
      (r: { checksJson: any }) => !(r.checksJson as any)?.disposable?.passed,
    ).length;

    return NextResponse.json({
      success: true,
      data: {
        meta: {
          jobId,
          filename: job.filename,
          generatedAt: new Date().toISOString(),
          totalEmails: results.length,
        },
        stats: {
          valid,
          invalid,
          risky,
          unknown,
          avgScore,
          deliverabilityRate: results.length > 0 ? Math.round((valid / results.length) * 100) : 0,
        },
        recommendations: [
          invalid > 0 ? `${invalid} emails invalides détectés - à supprimer avant l'envoi` : null,
          risky > 0 ? `${risky} emails risqués détectés - à vérifier manuellement` : null,
          disposable > 0 ? `${disposable} emails jetables détectés - à supprimer` : null,
        ].filter(Boolean),
        highRiskEmails: results
          .filter((r: { score: number }) => r.score < 40)
          .slice(0, 30)
          .map((r: { email: string; score: number; checksJson: any }) => ({
            email: r.email,
            score: r.score,
            issue: !(r.checksJson as any)?.smtp?.passed
              ? "SMTP failed"
              : !(r.checksJson as any)?.disposable?.passed
                ? "Disposable"
                : !(r.checksJson as any)?.format?.passed
                  ? "Invalid format"
                  : "Low score",
          })),
        results: results.map((r: { email: string; score: number; status: string }) => ({
          email: r.email,
          score: r.score,
          status: r.status,
        })),
      },
    });
  } catch (error) {
    loggerApi.error({ err: error }, "Export data error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
