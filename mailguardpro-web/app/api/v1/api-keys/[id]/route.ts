// API Route: Supprimer une clé API
// DELETE /api/v1/api-keys/[id]

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
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

    // Supprimer la clé (soft delete - désactiver)
    await prisma.apiKey.update({
      where: { id },
      data: { isActive: false },
    });

    // Audit log
    logAudit({
      userId: session.user.id,
      action: AuditAction.API_KEY_REVOKED,
      resource: AuditResource.API_KEY,
      resourceId: id,
      ipAddress: req.headers.get("x-forwarded-for") || undefined,
      metadata: { keyName: apiKey.name },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("[API] API key delete error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
