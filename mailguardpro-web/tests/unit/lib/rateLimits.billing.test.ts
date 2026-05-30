/**
 * Unit tests for lib/rateLimits.ts — billing action type.
 *
 * Verifies that PLAN_LIMITS includes a `billing` field for every plan tier,
 * and that each tier has valid (positive) limit values.
 *
 * We mock ioredis because rateLimits imports from @/lib/redis which creates
 * a Redis instance at module load time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted to create mock before imports
const { mockRedisInstance } = vi.hoisted(() => {
  const instance = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    setex: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(60),
    publish: vi.fn().mockResolvedValue(1),
    eval: vi.fn().mockResolvedValue([1, 60]),
    duplicate: vi.fn(),
    disconnect: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    on: vi.fn(),
  };
  return { mockRedisInstance: instance };
});

// Mock ioredis to return our controlled instance
vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => mockRedisInstance),
}));

// Override the global @/lib/redis mock from setup.ts
vi.mock("@/lib/redis", async () => {
  const actual = await vi.importActual("@/lib/redis");
  return {
    ...actual,
    redis: mockRedisInstance,
  };
});

import { PLAN_LIMITS, checkRateLimitByPlan, getPlanLimits } from "@/lib/rateLimits";

describe("PLAN_LIMITS — billing action type", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisInstance.eval.mockResolvedValue([1, 60]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ────────────────────────────────────────────
  // billing field exists in all plan tiers
  // ────────────────────────────────────────────

  it("FREE plan should have billing action type", () => {
    expect(PLAN_LIMITS.FREE).toHaveProperty("billing");
    expect(PLAN_LIMITS.FREE.billing).toBeDefined();
  });

  it("STARTER plan should have billing action type", () => {
    expect(PLAN_LIMITS.STARTER).toHaveProperty("billing");
    expect(PLAN_LIMITS.STARTER.billing).toBeDefined();
  });

  it("PRO plan should have billing action type", () => {
    expect(PLAN_LIMITS.PRO).toHaveProperty("billing");
    expect(PLAN_LIMITS.PRO.billing).toBeDefined();
  });

  it("BUSINESS plan should have billing action type", () => {
    expect(PLAN_LIMITS.BUSINESS).toHaveProperty("billing");
    expect(PLAN_LIMITS.BUSINESS.billing).toBeDefined();
  });

  // ────────────────────────────────────────────
  // billing has valid (positive) limit values
  // ────────────────────────────────────────────

  it("FREE billing should have positive requests limit", () => {
    const billing = PLAN_LIMITS.FREE.billing;
    expect(billing.requests).toBeGreaterThan(0);
    expect(typeof billing.requests).toBe("number");
    expect(Number.isInteger(billing.requests)).toBe(true);
  });

  it("FREE billing should have positive window value", () => {
    const billing = PLAN_LIMITS.FREE.billing;
    expect(billing.window).toBeGreaterThan(0);
    expect(typeof billing.window).toBe("number");
    expect(Number.isInteger(billing.window)).toBe(true);
  });

  it("STARTER billing should have positive requests limit", () => {
    const billing = PLAN_LIMITS.STARTER.billing;
    expect(billing.requests).toBeGreaterThan(0);
    expect(typeof billing.requests).toBe("number");
    expect(Number.isInteger(billing.requests)).toBe(true);
  });

  it("PRO billing should have positive requests limit", () => {
    const billing = PLAN_LIMITS.PRO.billing;
    expect(billing.requests).toBeGreaterThan(0);
    expect(typeof billing.requests).toBe("number");
    expect(Number.isInteger(billing.requests)).toBe(true);
  });

  it("BUSINESS billing should have positive requests limit (high/unlimited)", () => {
    const billing = PLAN_LIMITS.BUSINESS.billing;
    expect(billing.requests).toBeGreaterThan(0);
    expect(billing.requests).toBeGreaterThanOrEqual(999999);
    expect(typeof billing.requests).toBe("number");
    expect(Number.isInteger(billing.requests)).toBe(true);
  });

  it("billing limits should increase from FREE→STARTER→PRO→BUSINESS", () => {
    const freeRequests = PLAN_LIMITS.FREE.billing.requests;
    const starterRequests = PLAN_LIMITS.STARTER.billing.requests;
    const proRequests = PLAN_LIMITS.PRO.billing.requests;
    const businessRequests = PLAN_LIMITS.BUSINESS.billing.requests;

    expect(freeRequests).toBeLessThan(starterRequests);
    expect(starterRequests).toBeLessThan(proRequests);
    expect(proRequests).toBeLessThan(businessRequests);
  });

  // ────────────────────────────────────────────
  // checkRateLimitByPlan with billing action
  // ────────────────────────────────────────────

  it("should allow billing action for FREE plan under limit", async () => {
    mockRedisInstance.eval.mockResolvedValue([1, 60]);

    const result = await checkRateLimitByPlan("user-billing-free", "FREE", "billing");
    expect(result.success).toBe(true);
    expect(result.limit).toBe(PLAN_LIMITS.FREE.billing.requests);
  });

  it("should allow billing action for STARTER plan under limit", async () => {
    mockRedisInstance.eval.mockResolvedValue([5, 60]);

    const result = await checkRateLimitByPlan("user-billing-starter", "STARTER", "billing");
    expect(result.success).toBe(true);
    expect(result.limit).toBe(PLAN_LIMITS.STARTER.billing.requests);
  });

  it("should allow billing action for PRO plan under limit", async () => {
    mockRedisInstance.eval.mockResolvedValue([15, 60]);

    const result = await checkRateLimitByPlan("user-billing-pro", "PRO", "billing");
    expect(result.success).toBe(true);
    expect(result.limit).toBe(PLAN_LIMITS.PRO.billing.requests);
  });

  it("should allow billing action for BUSINESS plan (high limit)", async () => {
    mockRedisInstance.eval.mockResolvedValue([1, 60]);

    const result = await checkRateLimitByPlan("user-billing-business", "BUSINESS", "billing");
    expect(result.success).toBe(true);
  });

  it("should block billing action when limit exceeded for FREE plan", async () => {
    // FREE billing limit is 3 requests/min
    mockRedisInstance.eval.mockResolvedValue([4, 55]);

    const result = await checkRateLimitByPlan("user-billing-block", "FREE", "billing");
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should call redis.eval with correct billing key", async () => {
    await checkRateLimitByPlan("user-billing-key", "FREE", "billing");

    expect(mockRedisInstance.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      "ratelimit:user:user-billing-key:billing",
      expect.any(String),
      expect.any(String),
    );
  });

  // ────────────────────────────────────────────
  // getPlanLimits with billing
  // ────────────────────────────────────────────

  it("getPlanLimits should return billing field for FREE", () => {
    const limits = getPlanLimits("FREE");
    expect(limits).toHaveProperty("billing");
    expect(limits.billing.requests).toBeGreaterThan(0);
  });

  it("getPlanLimits should return billing field for all plans", () => {
    for (const plan of ["FREE", "STARTER", "PRO", "BUSINESS"] as const) {
      const limits = getPlanLimits(plan);
      expect(limits).toHaveProperty("billing");
      expect(limits.billing.window).toBeGreaterThan(0);
    }
  });
});
