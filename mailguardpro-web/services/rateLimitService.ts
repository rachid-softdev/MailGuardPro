import { prisma } from "@/lib/prisma";

const PLAN_LIMITS: Record<string, number> = {
  FREE: 20,
  STARTER: 100,
  PRO: 500,
  BUSINESS: 2000,
};

export interface RateLimitParams {
  rateLimitKey: string;
  rateLimitMax: number;
  userPlan: string | null;
}

export async function checkRateLimitByPlan(
  user: { id: string; plan?: string | null } | null,
  ip: string,
): Promise<RateLimitParams> {
  if (!user) {
    return {
      rateLimitKey: `ip:${ip}`,
      rateLimitMax: 10,
      userPlan: null,
    };
  }

  let userPlan: string;
  if (user.plan) {
    userPlan = user.plan;
  } else {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { plan: true },
    });
    userPlan = dbUser?.plan ?? "FREE";
  }

  return {
    rateLimitKey: `user:${user.id}`,
    rateLimitMax: PLAN_LIMITS[userPlan] ?? 20,
    userPlan,
  };
}
