// Types globaux pour NextAuth

import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      plan: "FREE" | "STARTER" | "PRO" | "BUSINESS";
      credits: number;
      role: "USER" | "ADMIN";
    };
  }

  interface User {
    id: string;
    plan?: "FREE" | "STARTER" | "PRO" | "BUSINESS";
    credits?: number;
    role?: "USER" | "ADMIN";
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
