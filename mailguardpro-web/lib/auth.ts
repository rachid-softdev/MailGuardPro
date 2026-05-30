import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Account } from "next-auth";
import NextAuth from "next-auth";
import type { AdapterUser } from "next-auth/adapters";
import type { JWT } from "next-auth/jwt";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";
import { validateAuthSecret } from "./authSecretValidator";
import { prisma } from "./prisma";
import { redis } from "./redis";

// Validate AUTH_SECRET at module load time
const secretCheck = validateAuthSecret();
if (!secretCheck.valid) {
  console.error("[Auth] " + secretCheck.message);
  if (process.env.NODE_ENV === "production") {
    throw new Error("Startup validation failed: " + secretCheck.message);
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // TODO: NextAuth v5 Adapter typing doesn't support extended PrismaClient
  // See: https://github.com/nextauthjs/next-auth/issues/9999
  adapter: PrismaAdapter(prisma as any),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Resend({
      apiKey: process.env.RESEND_API_KEY!,
      from: process.env.EMAIL_FROM || "noreply@mailguard.pro",
    }),
  ],
  callbacks: {
    async signIn({
      user,
      account,
      email,
      credentials,
      req,
    }: {
      user: AdapterUser;
      account: Account | null;
      email?: { address: string };
      credentials?: Record<string, unknown>;
      req?: { headers: { get: (name: string) => string | null } };
    }) {
      // FIX #18: Magic link rate limit (Redis-based — atomic SET NX EX)
      if (account?.provider === "resend" && email?.address) {
        try {
          const rateKey = `magiclink:${email.address}`;
          const acquired = await redis.set(rateKey, "1", "NX", "EX", 60);
          if (acquired === null) {
            console.warn(`[Auth] Magic link rate limited for ${email.address}`);
            return false;
          }
        } catch {
          // Redis unavailable — allow the request
          console.warn("[Auth] Redis unavailable for magic link rate limit");
        }

        // IP-based rate limiting to prevent targeted magic link DoS (6 req/min per IP)
        const ip =
          req?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          req?.headers?.get("x-real-ip") ||
          "unknown";
        try {
          const ipRateKey = `magiclink:ip:${ip}`;
          const ipAcquired = await redis.set(ipRateKey, "1", "NX", "EX", 10);
          if (ipAcquired === null) {
            console.warn(`[Auth] Magic link IP rate limited for ${ip}`);
            return false;
          }
        } catch {
          console.warn("[Auth] Redis unavailable for magic link IP rate limit");
        }
      }

      // FIX #6: Login audit
      if (!user) {
        console.warn(`[Auth] Login failed for: ${email?.address || "unknown"}`);
        try {
          await logAudit({
            action: AuditAction.USER_LOGIN_FAILED,
            resource: AuditResource.USER,
            metadata: {
              email: email?.address || "unknown",
              provider: account?.provider || "unknown",
            },
          });
        } catch (err) {
          console.error("[Auth] Failed to log login failure:", err);
        }
        return false;
      }
      // Log successful login
      if (account?.provider === "resend" || account?.provider === "google") {
        try {
          await logAudit({
            userId: user.id as string,
            action: AuditAction.USER_LOGIN,
            resource: AuditResource.USER,
            metadata: { provider: account.provider },
          });
        } catch {
          /* non-fatal */
        }
      }
      return true;
    },
    async session({ session, user }: { session: Session; user: AdapterUser }) {
      if (session.user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: session.user.email },
          select: {
            id: true,
            plan: true,
            credits: true,
            role: true,
            tokenVersion: true,
            isActive: true,
            userRoles: { select: { role: true } },
          },
        });

        if (dbUser) {
          // Reject sessions for deactivated users
          if (dbUser.isActive === false) {
            return { ...session, user: null as any, expires: new Date(0).toISOString() };
          }
          // Enforce session invalidation (tokenVersion was incremented via key revocation)
          if (dbUser.tokenVersion > 0 && dbUser.tokenVersion !== user.tokenVersion) {
            console.warn(
              "[Auth] Session invalidated — tokenVersion mismatch",
              JSON.stringify({
                userId: dbUser.id,
                sessionVersion: user.tokenVersion,
                dbVersion: dbUser.tokenVersion,
              }),
            );
            // Return a session with no user data → NextAuth treats this as unauthenticated
            return { ...session, user: null as any, expires: new Date(0).toISOString() };
          }

          session.user.id = dbUser.id;
          session.user.plan = dbUser.plan;
          session.user.credits = dbUser.credits;
          session.user.role = dbUser.role;
          session.user.tokenVersion = dbUser.tokenVersion;
          session.user.roles = dbUser.userRoles.map((ur) => ur.role);
        }
      }
      return session;
    },
    async jwt({ token, user }: { token: JWT; user?: AdapterUser | undefined }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/verify",
    error: "/error",
  },
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    callbackUrl: {
      name: `next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    csrfToken: {
      name: `next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  events: {
    async createUser({ user }: { user: AdapterUser }) {
      // Nouveau utilisateur = 100 crédits gratuits
      // Utiliser user.id (plus fiable que email qui peut avoir des races conditions)
      if (user?.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: { credits: 100 },
        });
      }
    },
  },
});
