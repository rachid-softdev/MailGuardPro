// Session cookie helpers
//
// Sessions are database-backed (NextAuth strategy: "database"): the cookie value is the
// session token and each DB row is one signed-in device. Routes that need to tell "this
// device" apart from the others (session management, API key revocation) read the token
// from the request cookies — both prod and dev cookie names are supported.

import type { NextRequest } from "next/server";

/** The session cookie value identifying the device that made the request. */
export function getCurrentSessionToken(req: NextRequest): string | undefined {
  return (
    req.cookies.get("next-auth.session-token")?.value ??
    req.cookies.get("__Secure-next-auth.session-token")?.value
  );
}
