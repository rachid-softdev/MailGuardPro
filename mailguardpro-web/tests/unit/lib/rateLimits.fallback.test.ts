/**
 * Unit tests for lib/rateLimits.ts — fallback path for unknown action types.
 *
 * Verifies that checkRateLimitByPlan falls back to default limits (10 req / 60s)
 * when the action is not found in PLAN_LIMITS, and that logging behaves correctly
 * on rejection.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock — ioredis instance must exist before vi.mock factories run
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Module mocks — must be at top level, before any imports
// ---------------------------------------------------------------------------
vi.mock("ioredis", () => {
  const Redis = function () {
    return mockRedisInstance;
  };
  return { default: Redis };
});

vi.mock("@/lib/redis", async () => {
  const actual = await vi.importActual("@/lib/redis");
  return {
    ...actual,
    redis: mockRedisInstance,
    queueRedis: mockRedisInstance,
    rateLimitRedis: mockRedisInstance,
  };
});

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    child: vi.fn(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() })),
  },
}));

import { logger } from "@/lib/logger";
// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------
import { checkRateLimitByPlan } from "@/lib/rateLimits";

describe("checkRateLimitByPlan — unknown action fallback (lines 70–87)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: within limit
    mockRedisInstance.eval.mockResolvedValue([1, 60]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ──────────────────────────────────────────
  //  1. Unknown action uses fallback limits
  // ──────────────────────────────────────────

  it("should use fallback limits (10 req / 60s) for unknown action types", async () => {
    const userId = "user-fallback-1";

    await checkRateLimitByPlan(userId, "FREE", "unknown_action" as any);

    // The fallback calls checkRateLimit(`user:${userId}:${action}`, 10, 60)
    // which internally runs redis.eval with key "ratelimit:user:..." and args "10", "60"
    expect(mockRedisInstance.eval).toHaveBeenCalledWith(
      expect.any(String), // Lua script
      1,
      `ratelimit:user:${userId}:unknown_action`,
      "10",
      "60",
    );
  });

  it("should use fallback limits regardless of plan tier", async () => {
    // The fallback path is reached when limits[action] is undefined.
    // This should happen for any plan tier — verify with STARTER and PRO as well.
    await checkRateLimitByPlan("user-fallback-starter", "STARTER", "unknown_action" as any);

    expect(mockRedisInstance.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      "ratelimit:user:user-fallback-starter:unknown_action",
      "10",
      "60",
    );
  });

  // ──────────────────────────────────────────
  //  2. Fallback succeeds — no logging
  // ──────────────────────────────────────────

  it("should return success without logging when fallback is within limit", async () => {
    // current=1, limit=10 → 1 <= 10 → success
    mockRedisInstance.eval.mockResolvedValue([1, 60]);

    const result = await checkRateLimitByPlan("user-within", "FREE", "unknown_action" as any);

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(9); // 10 - 1
    expect(result.limit).toBe(10);
    // No warning should be logged when within bounds
    expect(logger.warn).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────
  //  3. Fallback fails — logs warning
  // ──────────────────────────────────────────

  it("should log a warning and return failure when fallback exceeds limit", async () => {
    // current=11, limit=10 → 11 > 10 → blocked
    mockRedisInstance.eval.mockResolvedValue([11, 60]);

    const result = await checkRateLimitByPlan("user-over", "FREE", "unknown_action" as any);

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.limit).toBe(10);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  // ──────────────────────────────────────────
  //  4. logger.warn called with correct structure
  // ──────────────────────────────────────────

  it("should call logger.warn with expected fields on fallback rejection", async () => {
    const userId = "user-rejected";
    const plan = "STARTER" as const;
    const action = "unknown_action";

    // Force the fallback to be rejected
    mockRedisInstance.eval.mockResolvedValue([11, 60]);

    await checkRateLimitByPlan(userId, plan, action as any);

    expect(logger.warn).toHaveBeenCalledTimes(1);

    const [data, message] = logger.warn.mock.calls[0];

    // Message
    expect(message).toBe("RateLimit REJECTED");

    // Data payload shape
    expect(data).toMatchObject({
      userId,
      plan,
      action,
      limit: 10,
      window: 60,
      source: "redis",
    });
    // resetAt should be a valid ISO string date
    expect(data).toHaveProperty("resetAt");
    expect(typeof data.resetAt).toBe("string");
    expect(() => new Date(data.resetAt)).not.toThrow();
  });

  it("should include all expected fields in the warn payload", async () => {
    mockRedisInstance.eval.mockResolvedValue([99, 60]);

    await checkRateLimitByPlan("user-payload-check", "FREE", "unknown_action" as any);

    expect(logger.warn).toHaveBeenCalledTimes(1);

    const payload = logger.warn.mock.calls[0][0];

    // Every field the source code sets on the fallback path
    expect(payload).toHaveProperty("userId", "user-payload-check");
    expect(payload).toHaveProperty("plan", "FREE");
    expect(payload).toHaveProperty("action", "unknown_action");
    expect(payload).toHaveProperty("limit", 10);
    expect(payload).toHaveProperty("window", 60);
    expect(payload).toHaveProperty("resetAt");
    expect(payload).toHaveProperty("source", "redis");
  });
});
