// Types globaux pour NextAuth

import { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      plan: "FREE" | "STARTER" | "PRO" | "BUSINESS";
      credits: number;
      role: "USER" | "ADMIN";
      isActive: boolean;
      tokenVersion: number;
    } & DefaultSession["user"];
  }

  interface User {
    tokenVersion: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    plan?: "FREE" | "STARTER" | "PRO" | "BUSINESS";
    credits?: number;
    role?: "USER" | "ADMIN";
  }
}
