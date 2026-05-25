import { beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted to create mock before imports - mock ioredis to return our controlled instance
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

// Use importOriginal to get actual implementation but we need to mock the underlying redis instance
vi.mock("@/lib/redis", async () => {
  const actual = await vi.importActual("@/lib/redis");
  // Override the redis export to use our mock
  return {
    ...actual,
    redis: mockRedisInstance,
  };
});

// Import actual functions from lib/rateLimits - they will use the mocked redis
import {
  PLAN_LIMITS,
  RateLimitExceededError,
  checkRateLimitByPlan,
  getPlanLimits,
} from "@/lib/rateLimits";

describe("rateLimits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset all mock implementations
    mockRedisInstance.incr.mockResolvedValue(1);
    mockRedisInstance.expire.mockResolvedValue(1);
    mockRedisInstance.ttl.mockResolvedValue(60);
  });

  describe("PLAN_LIMITS", () => {
    it("should have all required plans", () => {
      expect(PLAN_LIMITS).toHaveProperty("FREE");
      expect(PLAN_LIMITS).toHaveProperty("STARTER");
      expect(PLAN_LIMITS).toHaveProperty("PRO");
      expect(PLAN_LIMITS).toHaveProperty("BUSINESS");
    });

    it("should have correct limits for FREE plan", () => {
      expect(PLAN_LIMITS.FREE.validate.requests).toBe(20);
      expect(PLAN_LIMITS.FREE.validate.window).toBe(60);
      expect(PLAN_LIMITS.FREE.bulk.requests).toBe(1);
      expect(PLAN_LIMITS.FREE.bulkSize).toBe(10000);
    });

    it("should have correct limits for STARTER plan", () => {
      expect(PLAN_LIMITS.STARTER.validate.requests).toBe(100);
      expect(PLAN_LIMITS.STARTER.bulk.requests).toBe(5);
    });

    it("should have correct limits for PRO plan", () => {
      expect(PLAN_LIMITS.PRO.validate.requests).toBe(500);
      expect(PLAN_LIMITS.PRO.bulkSize).toBe(100000);
    });

    it("should have unlimited limits for BUSINESS plan", () => {
      expect(PLAN_LIMITS.BUSINESS.validate.requests).toBe(999999);
      expect(PLAN_LIMITS.BUSINESS.bulk.requests).toBe(999999);
    });
  });

  describe("getPlanLimits", () => {
    it("should return limits for FREE plan", () => {
      const limits = getPlanLimits("FREE");
      expect(limits.validate.requests).toBe(20);
    });

    it("should return limits for STARTER plan", () => {
      const limits = getPlanLimits("STARTER");
      expect(limits.validate.requests).toBe(100);
    });

    it("should return limits for PRO plan", () => {
      const limits = getPlanLimits("PRO");
      expect(limits.validate.requests).toBe(500);
    });

    it("should return limits for BUSINESS plan", () => {
      const limits = getPlanLimits("BUSINESS");
      expect(limits.validate.requests).toBe(999999);
    });

    it("should return FREE plan limits for unknown plan", () => {
      const limits = getPlanLimits("UNKNOWN" as any);
      expect(limits).toEqual(PLAN_LIMITS.FREE);
    });
  });

  describe("checkRateLimitByPlan", () => {
    it("should allow request when under limit for FREE plan", async () => {
      mockRedisInstance.incr.mockResolvedValue(1);

      const result = await checkRateLimitByPlan("user-123", "FREE", "validate");

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(19); // 20 - 1
      expect(result.limit).toBe(20);
    });

    it("should block request when over limit for FREE plan", async () => {
      mockRedisInstance.incr.mockResolvedValue(21); // Over 20 limit

      const result = await checkRateLimitByPlan("user-123", "FREE", "validate");

      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should allow request for STARTER plan with higher limit", async () => {
      mockRedisInstance.incr.mockResolvedValue(50);

      const result = await checkRateLimitByPlan("user-123", "STARTER", "validate");

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(50); // 100 - 50
      expect(result.limit).toBe(100);
    });

    it("should allow request for PRO plan", async () => {
      mockRedisInstance.incr.mockResolvedValue(200);

      const result = await checkRateLimitByPlan("user-123", "PRO", "validate");

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(300); // 500 - 200
      expect(result.limit).toBe(500);
    });

    it("should return unlimited for BUSINESS validate", async () => {
      mockRedisInstance.incr.mockResolvedValue(1);
      const result = await checkRateLimitByPlan("user-123", "BUSINESS", "validate");
      expect(result.success).toBe(true);
      expect(result.limit).toBe(100000); // Was 999999
      expect(result.remaining).toBe(99999); // 100000 - 1
    });

    it("should return unlimited for BUSINESS bulk action", async () => {
      mockRedisInstance.incr.mockResolvedValue(1);
      const result = await checkRateLimitByPlan("user-123", "BUSINESS", "bulk");
      expect(result.success).toBe(true);
      expect(result.limit).toBe(5000);
      expect(result.remaining).toBe(4999);
    });

    it("should block BUSINESS user when effective limit is exceeded", async () => {
      mockRedisInstance.incr.mockResolvedValue(100001);
      const result = await checkRateLimitByPlan("user-123", "BUSINESS", "validate");
      expect(result.success).toBe(false);
    });

    it("should use correct limit values for each action type", async () => {
      // Verify that different action types use different limits from PLAN_LIMITS
      const freeValidateLimits = PLAN_LIMITS.FREE.validate;
      const freeBulkLimits = PLAN_LIMITS.FREE.bulk;

      expect(freeValidateLimits.requests).toBe(20);
      expect(freeValidateLimits.window).toBe(60);

      expect(freeBulkLimits.requests).toBe(1);
      expect(freeBulkLimits.window).toBe(3600);
    });

    it("should track different action types separately", async () => {
      // Test that checkRateLimitByPlan works for different actions
      mockRedisInstance.incr.mockResolvedValue(1);

      const result1 = await checkRateLimitByPlan("user-123", "FREE", "validate");
      const result2 = await checkRateLimitByPlan("user-123", "FREE", "bulk");

      // Both should succeed but with different limits
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.limit).toBe(20); // validate limit
      expect(result2.limit).toBe(1); // bulk limit
    });
  });

  describe("RateLimitExceededError", () => {
    it("should create error with correct message", () => {
      const resetAt = Date.now() + 30000;
      const error = new RateLimitExceededError(10, 60, resetAt);

      expect(error.name).toBe("RateLimitExceededError");
      expect(error.limit).toBe(10);
      expect(error.windowSeconds).toBe(60);
      expect(error.resetAt).toBe(resetAt);
      expect(error.message).toContain("Rate limit exceeded");
    });

    it("should calculate remaining seconds correctly", () => {
      const futureResetAt = Date.now() + 60000;
      const error = new RateLimitExceededError(10, 60, futureResetAt);

      // The message should contain the approximate time
      expect(error.message).toMatch(/\d+ seconds/);
    });
  });
});
