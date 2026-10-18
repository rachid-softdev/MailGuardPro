// Edge-safe auth check — used exclusively in proxy.ts (Edge Runtime) where
// `import { auth } from "./auth"` would trigger Node.js module bundling
// warnings (PrismaAdapter, ioredis, pino/crypto, etc.).
//
// lib/auth.ts uses `session.strategy = "database"`: the session cookie holds an
// opaque session token that can only be validated against the database by
// `auth()` in Node. `getToken()` (next-auth/jwt) decodes JWTs, so it always
// resolved to null for these sessions and the proxy rejected every logged-in
// user (redirected to /login despite a valid session).
//
// The proxy therefore only checks that a session cookie is present. This is a
// coarse gate for redirects — it must NOT be used for authorization decisions;
// real validation is performed server-side by auth() in layouts/API routes.

import type { NextRequest } from "next/server";

// `next-auth.session-token` is the configured cookie name (lib/auth.ts overrides
// the default entirely); `__Secure-` is included in case the app later switches
// to the secure-prefixed default.
const SESSION_COOKIE_NAMES = ["next-auth.session-token", "__Secure-next-auth.session-token"];

/**
 * Returns `true` when the request carries a NextAuth session cookie.
 * A present cookie does not guarantee a valid session (it may be expired or
 * revoked in the database) — callers must not treat this as authentication.
 */
export function hasSessionCookie(request: NextRequest | Request): boolean {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return false;
  return cookieHeader.split(";").some((part) => {
    const name = (part.split("=", 1)[0] ?? "").trim();
    return SESSION_COOKIE_NAMES.includes(name);
  });
}
