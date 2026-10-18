// API Route: Revoke all sessions except the current one
// POST /api/v1/user/sessions/revoke-others
//
// "Sign out other devices": keeps the session that made the request alive so the
// user is not logged out of the device they are using.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getCurrentSessionToken } from "@/lib/sessionCookie";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";

export async function POST(req: NextRequest) {
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

    // Without the cookie token we cannot tell the current session apart — refuse
    // rather than risk logging the user out of the device they are using.
    const currentToken = getCurrentSessionToken(req);
    if (!currentToken) {
      return NextResponse.json(
        { success: false, error: "Current session cookie not found" },
        { status: 400 },
      );
    }

    const result = await prisma.session.deleteMany({
      where: { userId: session.user.id, sessionToken: { not: currentToken } },
    });

    // Audit only when something actually changed
    if (result.count > 0) {
      void logAudit({
        userId: session.user.id,
        action: AuditAction.SESSION_FORCED_INVALIDATION,
        resource: AuditResource.SESSION,
        ipAddress: req.headers.get("x-forwarded-for") || undefined,
        metadata: { scope: "others", revokedCount: result.count },
      });
    }

    return NextResponse.json({ success: true, revokedCount: result.count });
  } catch (error) {
    loggerApi.error({ err: error }, "Revoke others sessions error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
