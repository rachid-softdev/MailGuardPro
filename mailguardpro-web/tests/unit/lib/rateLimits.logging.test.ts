/**
 * Unit tests for M-04 — Rate limit logging.
 *
 * Verifies that logger.warn (checkRateLimitByPlan) or console.warn
 * (checkMemoryRateLimit) is called when rate limits are exceeded.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock ioredis — use a proper constructor function (not arrow) so new Redis() works
vi.mock("ioredis", () => {
  const mockInstance = {
    get: vi.fn(),
    set: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
    publish: vi.fn(),
    eval: vi.fn(),
    duplicate: vi.fn(),
    disconnect: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    on: vi.fn(),
    quit: vi.fn(),
  };
  const Redis = function () {
    return mockInstance;
  };
  return { default: Redis };
});

// Override @/lib/redis to control checkRateLimit's return value
vi.mock("@/lib/redis", async () => {
  const actual = await vi.importActual<typeof import("@/lib/redis")>("@/lib/redis");
  return {
    ...actual,
    checkRateLimit: vi.fn().mockResolvedValue({
      success: false,
      remaining: 0,
      resetAt: Date.now() + 60000,
      limit: 20,
    }),
  };
});

// Mock logger — checkRateLimitByPlan uses logger.warn (pino-style)
const mockLoggerWarn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({
  logger: {
    warn: mockLoggerWarn,
    error: vi.fn(),
    info: vi.fn(),
    child: vi.fn(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() })),
  },
  loggerApi: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  loggerWebhook: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  loggerWorker: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  loggerAuth: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { checkMemoryRateLimit, clearSweeper } from "@/lib/rateLimitMemory";
import { checkRateLimitByPlan } from "@/lib/rateLimits";

describe("Rate limit logging [M-04]", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    clearSweeper();
    vi.clearAllMocks();
  });

  // ────────────────────────────────────────────
  // checkRateLimitByPlan logging (Redis path)
  // Uses logger.warn (pino-style: logger.warn(dataObj, msgStr))
  // ────────────────────────────────────────────

  it("should log warning when rate limit exceeded via checkRateLimitByPlan", async () => {
    const result = await checkRateLimitByPlan("user-1", "FREE", "validate");

    expect(result.success).toBe(false);
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);

    const data = mockLoggerWarn.mock.calls[0][0];
    const msg = mockLoggerWarn.mock.calls[0][1];
    expect(msg).toBe("RateLimit REJECTED");
    expect(data.userId).toBe("user-1");
    expect(data.plan).toBe("FREE");
    expect(data.action).toBe("validate");
    expect(data.limit).toBe(20);
    expect(data.window).toBe(60);
    expect(data.source).toBe("redis");
    expect(data).toHaveProperty("resetAt");
  });

  it("should log warning with correct plan and action fields", async () => {
    await checkRateLimitByPlan("user-pro", "PRO", "bulk");

    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
    const data = mockLoggerWarn.mock.calls[0][0];
    expect(data.userId).toBe("user-pro");
    expect(data.plan).toBe("PRO");
    expect(data.action).toBe("bulk");
  });

  it("should log warning for export action type", async () => {
    await checkRateLimitByPlan("user-export", "STARTER", "export");

    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
    const data = mockLoggerWarn.mock.calls[0][0];
    expect(data.action).toBe("export");
    expect(data.plan).toBe("STARTER");
  });

  it("should log warning for billing action type", async () => {
    await checkRateLimitByPlan("user-billing", "FREE", "billing");

    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
    const data = mockLoggerWarn.mock.calls[0][0];
    expect(data.action).toBe("billing");
  });

  // ────────────────────────────────────────────
  // checkMemoryRateLimit logging (memory fallback)
  // Uses console.warn directly
  // ────────────────────────────────────────────

  it("should log warning when memory rate limit exceeded", async () => {
    const key = "memory-exceed-test";
    const limit = 5;
    const windowSeconds = 60;

    // Exhaust the limit (50% of 5 = 2, so 3 requests will exceed)
    for (let i = 0; i < 3; i++) {
      await checkMemoryRateLimit(key, limit, windowSeconds);
    }

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnArg = warnSpy.mock.calls[0];
    expect(warnArg[0]).toBe("[RateLimit] REJECTED (memory fallback)");

    const logged = JSON.parse(warnArg[1] as string);
    expect(logged.key).toBe(key);
    expect(logged.originalLimit).toBe(limit);
    expect(logged.effectiveLimit).toBe(2); // floor(5 * 0.5)
    expect(logged.windowSeconds).toBe(windowSeconds);
    expect(logged.source).toBe("memory");
    expect(logged).toHaveProperty("currentCount");
    expect(logged).toHaveProperty("resetAt");
  });

  it("should log memory warning with correct fields for different limits", async () => {
    const key = "memory-diff-limit";
    // Original 100 → effective 50
    for (let i = 0; i < 51; i++) {
      await checkMemoryRateLimit(key, 100, 30);
    }

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(warnSpy.mock.calls[0][1] as string);
    expect(logged.key).toBe(key);
    expect(logged.originalLimit).toBe(100);
    expect(logged.effectiveLimit).toBe(50);
    expect(logged.windowSeconds).toBe(30);
    expect(logged.source).toBe("memory");
  });

  it("should not log warning when rate limit is within bounds (memory)", async () => {
    const key = "within-bounds";
    await checkMemoryRateLimit(key, 10, 60); // First request within limit

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("should log warning on each excess request (memory)", async () => {
    const key = "log-each-excess";
    // The code logs on every exceed, not just once.
    // Limit 5 → effective 2. Requests 1-2: within limit; requests 3-10: each exceeds.
    for (let i = 0; i < 10; i++) {
      await checkMemoryRateLimit(key, 5, 60);
    }

    // 8 excess requests → 8 warnings
    expect(warnSpy).toHaveBeenCalledTimes(8);
  });
});
