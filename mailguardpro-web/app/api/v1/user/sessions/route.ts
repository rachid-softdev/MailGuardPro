// API Route: Active sessions for the current user
// GET /api/v1/user/sessions
//
// Sessions are database-backed (NextAuth strategy: "database"), so each row in the
// Session table is one signed-in device. Deleting a row revokes that device instantly.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getCurrentSessionToken } from "@/lib/sessionCookie";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const currentToken = getCurrentSessionToken(req);

    const sessions = await prisma.session.findMany({
      where: { userId: session.user.id },
      orderBy: { expires: "desc" },
      select: { id: true, expires: true, sessionToken: true },
    });

    return NextResponse.json({
      success: true,
      data: sessions.map((s) => ({
        id: s.id,
        expires: s.expires,
        isCurrent: currentToken ? s.sessionToken === currentToken : false,
      })),
    });
  } catch (error) {
    loggerApi.error({ err: error }, "Sessions list error");
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
