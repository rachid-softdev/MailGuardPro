import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Account } from "next-auth";
import NextAuth, { type Session } from "next-auth";
import type { AdapterUser } from "next-auth/adapters";
import type { JWT } from "next-auth/jwt";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { AuditAction, AuditResource, logAudit } from "@/services/auditLogger";
import { validateAuthSecret } from "./authSecretValidator";
import { loggerAuth } from "./logger";
import { prisma } from "./prisma";
import { redis } from "./redis";

// Validate AUTH_SECRET at module load time
const secretCheck = validateAuthSecret();
if (!secretCheck.valid) {
  loggerAuth.error({ msg: secretCheck.message }, "Auth secret validation failed");
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
    // TODO: Fix NextAuth v5 callback parameter types
    async signIn(params: any) {
      const { user, account, email, req } = params as {
        user: AdapterUser;
        account: Account | null;
        email?: { address: string };
        req?: { headers: { get: (name: string) => string | null } };
      };
      // FIX #18: Magic link rate limit (Redis-based — atomic SET NX EX)
      if (account?.provider === "resend" && email?.address) {
        try {
          const rateKey = `magiclink:${email.address}`;
          const acquired = await redis.set(rateKey, "1", "EX", 60, "NX");
          if (acquired === null) {
            loggerAuth.warn("Magic link rate limited");
            return false;
          }
        } catch {
          // Redis unavailable — allow the request
          loggerAuth.warn("Redis unavailable for magic link rate limit");
        }

        // IP-based rate limiting to prevent targeted magic link DoS (6 req/min per IP)
        const ip =
          req?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          req?.headers?.get("x-real-ip") ||
          "unknown";
        try {
          const ipRateKey = `magiclink:ip:${ip}`;
          const ipAcquired = await redis.set(ipRateKey, "1", "EX", 10, "NX");
          if (ipAcquired === null) {
            loggerAuth.warn({ ip }, "Magic link IP rate limited");
            return false;
          }
        } catch {
          loggerAuth.warn("Redis unavailable for magic link IP rate limit");
        }
      }

      // FIX #6: Login audit
      if (!user) {
        loggerAuth.warn("Login failed");
        try {
          await logAudit({
            action: AuditAction.USER_LOGIN_FAILED,
            resource: AuditResource.USER,
            metadata: {
              provider: account?.provider || "unknown",
            },
          });
        } catch (err) {
          loggerAuth.error({ err }, "Failed to log login failure");
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
            loggerAuth.warn(
              {
                userId: dbUser.id,
                sessionVersion: user.tokenVersion,
                dbVersion: dbUser.tokenVersion,
              },
              "Session invalidated — tokenVersion mismatch",
            );
            // ÉTAPE 1: Supprimer TOUTES les sessions de l'utilisateur
            await prisma.session.deleteMany({ where: { userId: dbUser.id } });
            // ÉTAPE 2: Logger l'événement (best-effort, non-bloquant)
            logAudit({
              userId: dbUser.id,
              action: AuditAction.SESSION_FORCED_INVALIDATION,
              resource: AuditResource.SESSION,
              metadata: {
                previousTokenVersion: user.tokenVersion,
                currentTokenVersion: dbUser.tokenVersion,
              },
            }).catch((err: unknown) => {
              loggerAuth.error({ err }, "Failed to log audit event during session invalidation");
            });
            // Return a session with no user data → NextAuth treats this as unauthenticated
            return { ...session, user: null as any, expires: new Date(0).toISOString() };
          }

          session.user.id = dbUser.id;
          session.user.plan = dbUser.plan;
          session.user.credits = dbUser.credits;
          session.user.role = dbUser.role;
          session.user.tokenVersion = dbUser.tokenVersion;
          session.user.roles = dbUser.userRoles.map((ur: { role: string }) => ur.role);
        }
      }
      return session;
    },
    async jwt(params: any) {
      const { token, user } = params as { token: JWT; user?: AdapterUser | undefined };
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
    async createUser(params: any) {
      const { user } = params as { user: AdapterUser };
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
