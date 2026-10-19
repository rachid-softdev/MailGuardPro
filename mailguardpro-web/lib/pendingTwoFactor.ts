// Server-only helper: detects a session pending the two-factor challenge.
//
// The session callback in lib/auth.ts intentionally resolves these sessions as
// unauthenticated (no user), so protected pages cannot rely on auth() to tell a
// "logged out" browser apart from a "2FA pending" one. Layouts use this helper
// to route the latter to /login/2fa instead of the generic /login page.

import { cookies } from "next/headers";
import { prisma } from "./prisma";

export async function hasPendingTwoFactorChallenge(): Promise<boolean> {
  const store = await cookies();
  const sessionToken =
    store.get("next-auth.session-token")?.value ??
    store.get("__Secure-next-auth.session-token")?.value;
  if (!sessionToken) return false;

  const row = await prisma.session.findUnique({
    where: { sessionToken },
    select: {
      twoFactorVerifiedAt: true,
      expires: true,
      user: { select: { twoFactorEnabled: true, isActive: true } },
    },
  });

  if (!row || row.expires.getTime() < Date.now()) return false;
  return (
    row.user.twoFactorEnabled === true &&
    row.user.isActive !== false &&
    row.twoFactorVerifiedAt == null
  );
}
