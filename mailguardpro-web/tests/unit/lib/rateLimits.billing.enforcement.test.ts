/**
 * Unit tests for lib/rateLimits.ts — billing-related rate-limit behavior.
 *
 * Covers the unlimited (BUSINESS) branch and the unknown-action fallback,
 * and documents the gap where the `billing` action is configured but never
 * actually wired into the subscribe/portal routes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCheckRateLimit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(), set: vi.fn() },
  checkRateLimit: mockCheckRateLimit,
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
}));

import { checkRateLimitByPlan } from "@/lib/rateLimits";

describe("checkRateLimitByPlan — billing-related behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockImplementation(async (_key: string, req: number, _win: number) => ({
      success: true,
      remaining: (req as number) - 1,
      resetAt: Date.now() + 60000,
      limit: req as number,
    }));
  });
  afterEach(() => vi.restoreAllMocks());

  // ── P2: unknown action → fallback to 10 req / 60s ──
  it("should fall back to a 10/60 default for an unknown action", async () => {
    const res = await checkRateLimitByPlan("user-x", "FREE", "does-not-exist" as any);
    expect(res.success).toBe(true);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.stringContaining("does-not-exist"),
      10,
      60,
    );
  });

  // ── P2: BUSINESS unlimited → effective limit 100000 for validate ──
  it("should apply the 100000 effective limit for BUSINESS validate", async () => {
    const res = await checkRateLimitByPlan("user-biz", "BUSINESS", "validate");
    expect(res.success).toBe(true);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.stringContaining("business"),
      100000,
      60,
    );
  });

  // ── P2: BUSINESS unlimited → effective limit 5000 for bulk/apiKeys/webhooks ──
  it.each(["bulk", "apiKeys", "webhooks"] as const)(
    "should apply the 5000 effective limit for BUSINESS %s",
    async (action) => {
      await checkRateLimitByPlan("user-biz", "BUSINESS", action);
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.stringContaining("business"),
        5000,
        3600,
      );
    },
  );

  // ── P1: GAP — `billing` action is configured but never enforced in routes ──
  it.skip("BUG: billing rate-limit action is configured but not wired into subscribe/portal routes", () => {
    // lib/rateLimits.ts defines PLAN_LIMITS[*].billing, and checkRateLimitByPlan
    // supports the "billing" action, but app/api/v1/billing/subscribe/route.ts and
    // app/api/v1/billing/portal/route.ts never call checkRateLimitByPlan(uid, plan, "billing").
    // This leaves the configured billing limits as dead config. Wire enforcement
    // (or remove the config) to close this gap.
    expect(true).toBe(false);
  });
});
