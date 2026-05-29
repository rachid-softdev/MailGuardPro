import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { prisma } from "./prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as any,
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
    async session({ session, user }: any) {
      if (session.user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { id: true, plan: true, credits: true, role: true, tokenVersion: true },
        });

        if (dbUser) {
          // Detect session invalidation (tokenVersion was incremented)
          if (dbUser.tokenVersion > 0 && dbUser.tokenVersion !== (user as any)?.tokenVersion) {
            console.warn(
              "[Auth] Session invalidated — tokenVersion mismatch",
              JSON.stringify({
                userId: dbUser.id,
                sessionVersion: (user as any)?.tokenVersion,
                dbVersion: dbUser.tokenVersion,
              }),
            );
          }

          session.user.id = dbUser.id;
          session.user.plan = dbUser.plan;
          session.user.credits = dbUser.credits;
          session.user.role = dbUser.role;
          (session.user as any).tokenVersion = dbUser.tokenVersion;
        }
      }
      return session;
    },
    async jwt({ token, user }: any) {
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
    async createUser({ user }: any) {
      // Nouveau utilisateur = 100 crédits gratuits
      if (user.email) {
        await prisma.user.update({
          where: { email: user.email },
          data: { credits: 100 },
        });
      }
    },
  },
});
