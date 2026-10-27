// Monthly validation-credit refills for paid plans.
//
// `User.credits` is a legacy balance that still gates single validations and
// bulk jobs. Paid plans include a fresh allowance each month (including annual
// subscriptions, which are refilled monthly). The refill is idempotent:
// callers only reset when `creditsResetAt` is due, and the update is guarded by
// the same condition so a cron/webhook race can only reset once.

import { PLAN_INCLUDED_CREDITS } from "./plans";
import { prisma } from "./prisma";
import type { Plan } from "./rateLimits";

export const PAID_PLANS: readonly Plan[] = ["STARTER", "PRO", "BUSINESS"];

/** BUSINESS is unlimited for validation; its credit balance is not meaningful. */
export function includedCreditsForPlan(plan: Plan): number {
  if (plan === "BUSINESS") return 0;
  return PLAN_INCLUDED_CREDITS[plan] ?? 0;
}

export function isPaidPlan(plan: string): plan is Plan {
  return (PAID_PLANS as readonly string[]).includes(plan);
}

/**
 * Add one month without the Jan-31 → Mar-3 overflow. The time of day is
 * preserved so refills stay stable across cycles.
 */
export function nextMonthlyReset(from: Date = new Date()): Date {
  const next = new Date(from);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const daysInMonth = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(day, daysInMonth));
  return next;
}

function dueFilter(now: Date) {
  return [{ creditsResetAt: null }, { creditsResetAt: { lte: now } }];
}

/**
 * Refill one user's allowance when due. Returns true when this call performed
 * the refill. A null `creditsResetAt` is treated as due once, so paid users
 * created before this field existed are remediated on the next cron run.
 */
export async function resetCreditsIfDue(userId: string, now: Date = new Date()): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, creditsResetAt: true },
  });

  if (!user || !isPaidPlan(user.plan)) return false;
  if (user.creditsResetAt && user.creditsResetAt > now) return false;

  const updated = await prisma.user.updateMany({
    where: {
      id: userId,
      plan: user.plan,
      OR: dueFilter(now),
    },
    data: {
      credits: includedCreditsForPlan(user.plan),
      creditsResetAt: nextMonthlyReset(now),
    },
  });

  return updated.count > 0;
}

/**
 * Refill every paid member of an organization when the allowance is due.
 * Used by the Stripe invoice webhook so a successful billing cycle is
 * reflected even if the daily cron has not run yet.
 */
export async function resetCreditsForOrganization(
  organizationId: string,
  plan: Plan,
  now: Date = new Date(),
): Promise<number> {
  if (!isPaidPlan(plan)) return 0;

  const updated = await prisma.user.updateMany({
    where: {
      organizationId,
      plan,
      OR: dueFilter(now),
    },
    data: {
      credits: includedCreditsForPlan(plan),
      creditsResetAt: nextMonthlyReset(now),
    },
  });

  return updated.count;
}

/**
 * Cron entry point: refill every paid user whose allowance is due. The update
 * is conditional per user, so this is safe to run concurrently with webhook
 * renewals.
 */
export async function resetDueCredits(
  now: Date = new Date(),
  limit = 10000,
): Promise<{ scanned: number; reset: number }> {
  const due = await prisma.user.findMany({
    where: {
      plan: { in: [...PAID_PLANS] },
      OR: dueFilter(now),
    },
    select: { id: true },
    take: limit,
  });

  let reset = 0;
  for (const user of due) {
    if (await resetCreditsIfDue(user.id, now)) reset++;
  }

  return { scanned: due.length, reset };
}
