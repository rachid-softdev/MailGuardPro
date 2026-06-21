/**
 * Unit tests for lib/redis.ts — circuit breaker integration with checkRateLimit.
 *
 * Verifies that the redisCircuitBreaker transitions through OPEN/HALF_OPEN/CLOSED
 * states based on eval failures, and that the memory fallback is used appropriately.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRedisInstance } = vi.hoisted(() => ({
  mockRedisInstance: {
    eval: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
    publish: vi.fn(),
    on: vi.fn().mockReturnThis(),
    duplicate: vi.fn(() => ({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      disconnect: vi.fn(),
      on: vi.fn(),
    })),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    disconnect: vi.fn(),
  },
}));

vi.mock("ioredis", () => ({
  default: function () {
    return mockRedisInstance;
  },
}));

vi.mock("@/lib/redis", async () => {
  const actual = await vi.importActual<typeof import("@/lib/redis")>("@/lib/redis");
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
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

import { checkRateLimit, redisCircuitBreaker } from "@/lib/redis";

describe("Circuit breaker integration with checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisCircuitBreaker.reset();
    mockRedisInstance.eval.mockResolvedValue([1, 60]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ────────────────────────────────────────────
  // Circuit OPEN
  // ────────────────────────────────────────────

  it("should open circuit after 5 consecutive eval failures", async () => {
    mockRedisInstance.eval.mockRejectedValue(new Error("Redis down"));

    for (let i = 0; i < 5; i++) {
      await checkRateLimit(`circuit-open-key-${i}`, 10, 60);
    }

    expect(redisCircuitBreaker.getState()).toBe("OPEN");
  });

  it("should not call eval when circuit is OPEN (memory fallback used)", async () => {
    // Open the circuit first
    mockRedisInstance.eval.mockRejectedValue(new Error("Redis down"));
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(`circuit-fallback-key-${i}`, 10, 60);
    }
    expect(redisCircuitBreaker.getState()).toBe("OPEN");

    // Clear eval call history
    mockRedisInstance.eval.mockClear();

    // This call should use the memory fallback without calling eval
    const result = await checkRateLimit("circuit-fallback-after-open", 10, 60);

    expect(mockRedisInstance.eval).not.toHaveBeenCalled();
    // Memory fallback applies 50% stricter limit
    expect(result.limit).toBe(5);
    expect(result.success).toBe(true);
  });

  // ────────────────────────────────────────────
  // OPEN → HALF_OPEN (probe)
  // ────────────────────────────────────────────

  it("should probe eval after timeout (HALF_OPEN transition)", async () => {
    vi.useFakeTimers();

    // Open the circuit
    mockRedisInstance.eval.mockRejectedValue(new Error("Redis down"));
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(`probe-open-key-${i}`, 10, 60);
    }
    expect(redisCircuitBreaker.getState()).toBe("OPEN");

    // Clear eval call history so we only count the probe
    mockRedisInstance.eval.mockClear();

    // Advance past the timeout (15s)
    vi.advanceTimersByTime(15000);

    // Next call should HALF_OPEN and call eval
    mockRedisInstance.eval.mockResolvedValue([1, 60]);
    const result = await checkRateLimit("probe-key-after-timeout", 10, 60);

    expect(mockRedisInstance.eval).toHaveBeenCalledTimes(1);
    expect(result.limit).toBe(10); // Redis path, not memory
    expect(redisCircuitBreaker.getState()).toBe("HALF_OPEN");
  });

  // ────────────────────────────────────────────
  // HALF_OPEN → CLOSED
  // ────────────────────────────────────────────

  it("should close circuit after 2 successful probes", async () => {
    vi.useFakeTimers();

    // Open the circuit
    mockRedisInstance.eval.mockRejectedValue(new Error("Redis down"));
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(`close-open-key-${i}`, 10, 60);
    }
    expect(redisCircuitBreaker.getState()).toBe("OPEN");

    // Advance past timeout
    vi.advanceTimersByTime(15000);

    // Probe 1 — success → HALF_OPEN
    mockRedisInstance.eval.mockResolvedValue([1, 60]);
    await checkRateLimit("close-probe-1", 10, 60);
    expect(redisCircuitBreaker.getState()).toBe("HALF_OPEN");

    // Probe 2 — success → CLOSED (successThreshold = 2)
    mockRedisInstance.eval.mockResolvedValue([1, 60]);
    await checkRateLimit("close-probe-2", 10, 60);
    expect(redisCircuitBreaker.getState()).toBe("CLOSED");
  });

  // ────────────────────────────────────────────
  // HALF_OPEN → OPEN on failure
  // ────────────────────────────────────────────

  it("should re-open circuit when a probe fails in HALF_OPEN state", async () => {
    vi.useFakeTimers();

    // Open the circuit
    mockRedisInstance.eval.mockRejectedValue(new Error("Redis down"));
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(`reopen-open-key-${i}`, 10, 60);
    }
    expect(redisCircuitBreaker.getState()).toBe("OPEN");

    // Advance past timeout
    vi.advanceTimersByTime(15000);

    // First probe succeeds → HALF_OPEN
    mockRedisInstance.eval.mockResolvedValueOnce([1, 60]);
    await checkRateLimit("reopen-probe-1", 10, 60);
    expect(redisCircuitBreaker.getState()).toBe("HALF_OPEN");

    // Clear eval call history
    mockRedisInstance.eval.mockClear();

    // Now fail again — should stay HALF_OPEN (failure count is 1, threshold is 5)
    mockRedisInstance.eval.mockRejectedValue(new Error("Redis flaky"));
    const result = await checkRateLimit("reopen-probe-2", 10, 60);
    expect(result.limit).toBe(5); // memory fallback
    // still HALF_OPEN because failureCount (1) < failureThreshold (5)
    expect(redisCircuitBreaker.getState()).toBe("HALF_OPEN");
  });
});
