// Edge-safe auth helper — verifies JWT without loading Prisma/Redis/logger
// Used exclusively in proxy.ts (Edge Runtime) where `import { auth } from "./auth"` would
// trigger Node.js module bundling warnings (PrismaAdapter, ioredis, pino/crypto, etc.)
//
// For the full auth handler (callbacks, DB-backed sessions), use lib/auth.ts instead.

import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const AUTH_SECRET = process.env.AUTH_SECRET;

/**
 * Returns the decoded JWT token for the given request, or `null` if not authenticated.
 * Lightweight / edge-safe equivalent of `auth()` from `@/lib/auth`.
 */
export async function getAuthToken(
  request: NextRequest | Request,
): Promise<{ sub?: string; email?: string; name?: string; picture?: string } | null> {
  if (!AUTH_SECRET) {
    // AUTH_SECRET not configured: auth checks will fail-closed (redirect to login)
    if (process.env.NODE_ENV === "development") {
      console.warn("[MailGuard] AUTH_SECRET not set — auth checks will reject all requests");
    }
    return null;
  }

  try {
    const token = await getToken({
      req: request,
      secret: AUTH_SECRET,
      secureCookie: process.env.NODE_ENV === "production",
    });
    return token as { sub?: string; email?: string; name?: string; picture?: string } | null;
  } catch {
    return null;
  }
}
