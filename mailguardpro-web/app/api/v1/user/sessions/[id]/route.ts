// API Route: Revoke one session
// DELETE /api/v1/user/sessions/[id]

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getCurrentSessionToken } from "@/lib/sessionCookie";
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

    // Ownership check (IDOR guard) — only the user's own sessions can be revoked
    const target = await prisma.session.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!target) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }

    // Refuse to revoke the session making this request — avoids a confusing
    // half-logged-out state; sign out via the normal flow instead.
    const currentToken = getCurrentSessionToken(req);
    if (currentToken && target.sessionToken === currentToken) {
      return NextResponse.json(
        { success: false, error: "Cannot revoke your current session. Use sign out instead." },
        { status: 400 },
      );
    }

    await prisma.session.delete({ where: { id } });

    // Audit log (non-blocking)
    void logAudit({
      userId: session.user.id,
      action: AuditAction.SESSION_FORCED_INVALIDATION,
      resource: AuditResource.SESSION,
      resourceId: id,
      ipAddress: req.headers.get("x-forwarded-for") || undefined,
      metadata: { scope: "single" },
    });

    return NextResponse.json({ success: true, message: "Session revoked" });
  } catch (error) {
    loggerApi.error({ err: error }, "Session revoke error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
