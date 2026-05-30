// API Route: Supprimer une clé API
// DELETE /api/v1/api-keys/[id]

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // CSRF protection
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

    const { id } = await params;

    // Vérifier que la clé appartient à l'utilisateur
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!apiKey) {
      return NextResponse.json({ success: false, error: "API key not found" }, { status: 404 });
    }

    // Atomic transaction: revoke key + invalidate all sessions
    await prisma.$transaction([
      prisma.apiKey.update({
        where: { id },
        data: { isActive: false },
      }),
      prisma.user.update({
        where: { id: session.user.id },
        data: { tokenVersion: { increment: 1 } },
      }),
      prisma.session.deleteMany({
        where: { userId: session.user.id },
      }),
    ]);

    // Audit log (non-blocking)
    void logAudit({
      userId: session.user.id,
      action: AuditAction.API_KEY_REVOKED,
      resource: AuditResource.API_KEY,
      resourceId: id,
      ipAddress: req.headers.get("x-forwarded-for") || undefined,
      metadata: { keyName: apiKey.name, tokenVersionIncremented: true, sessionsDeleted: true },
    });

    return NextResponse.json({
      success: true,
      message: "API key revoked. All sessions invalidated — please re-login on other devices.",
    });
  } catch (error) {
    console.error("[API] API key delete error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
