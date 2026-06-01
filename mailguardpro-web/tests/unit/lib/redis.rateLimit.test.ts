/**
 * Unit tests for lib/redis.ts — checkRateLimit fallback behavior.
 *
 * We mock the underlying ioredis instance so we can control eval() results.
 * The setup.ts globally mocks @/lib/redis, but here we override that to
 * keep the real checkRateLimit implementation while injecting a mock Redis client.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted helpers — available before vi.mock factories run
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
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("ioredis", () => {
  const Redis = function () {
    return mockRedisInstance;
  };
  return { default: Redis };
});

// Override the global @/lib/redis mock from setup.ts so we get the real
// checkRateLimit implementation but with our controlled redis client.
vi.mock("@/lib/redis", async () => {
  const actual = await vi.importActual("@/lib/redis");
  return {
    ...actual,
    redis: mockRedisInstance,
    queueRedis: mockRedisInstance,
    rateLimitRedis: mockRedisInstance,
  };
});

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------
import { checkRateLimit } from "@/lib/redis";

describe("checkRateLimit Redis fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: Redis works
    mockRedisInstance.eval.mockResolvedValue([5, 55]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ────────────────────────────────────────────
  // Redis working path
  // ────────────────────────────────────────────

  it("should use Redis result when Redis works", async () => {
    mockRedisInstance.eval.mockResolvedValue([3, 60]);

    const result = await checkRateLimit("test-key:redis-works", 10, 60);

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(7); // 10 - 3
    expect(result.limit).toBe(10);
    expect(mockRedisInstance.eval).toHaveBeenCalledTimes(1);
  });

  it("should block when Redis says limit exceeded", async () => {
    mockRedisInstance.eval.mockResolvedValue([11, 55]);

    const result = await checkRateLimit("test-key:redis-block", 10, 60);

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.limit).toBe(10);
  });

  it("should call redis.eval with correct arguments", async () => {
    await checkRateLimit("test-key:args-check", 50, 120);

    expect(mockRedisInstance.eval).toHaveBeenCalledWith(
      expect.any(String), // Lua script
      1,
      "ratelimit:test-key:args-check",
      "50",
      "120",
    );
  });

  // ────────────────────────────────────────────
  // Redis failure → memory fallback
  // ────────────────────────────────────────────

  it("should fall back to memory rate limiter when Redis throws", async () => {
    mockRedisInstance.eval.mockRejectedValue(new Error("Redis connection refused"));

    const result = await checkRateLimit("test-key:redis-down", 100, 60);

    // Memory limiter should be used — applies 50% stricter limit
    expect(result.success).toBe(true);
    expect(result.limit).toBe(50); // floor(100 * 0.5)
    expect(result.remaining).toBe(49);
  });

  it("should fall back to memory when Redis eval returns wrong format", async () => {
    // Simulate parse error in the catch block
    mockRedisInstance.eval.mockRejectedValue(new Error("Unexpected reply"));

    const result = await checkRateLimit("test-key:bad-format", 10, 60);

    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("remaining");
    expect(result).toHaveProperty("resetAt");
    expect(result).toHaveProperty("limit");
  });

  it("memory fallback should still enforce limits", async () => {
    const key = "test-key:fallback-limit";
    for (let i = 0; i < 5; i++) {
      mockRedisInstance.eval.mockRejectedValue(new Error("Redis down"));
      const result = await checkRateLimit(key, 10, 60);
      // limit = floor(10 * 0.5) = 5
      expect(result.limit).toBe(5);
      if (i < 4) expect(result.success).toBe(true);
    }
    // 6th request should be blocked (limit=5, count would be 6)
    mockRedisInstance.eval.mockRejectedValue(new Error("Redis down"));
    const result = await checkRateLimit(key, 10, 60);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should fall back independently for different keys", async () => {
    mockRedisInstance.eval.mockRejectedValue(new Error("Redis down"));

    const [rA, rB] = await Promise.all([
      checkRateLimit("fallback-key-a", 10, 60),
      checkRateLimit("fallback-key-b", 10, 60),
    ]);

    expect(rA.success).toBe(true);
    expect(rB.success).toBe(true);
    expect(rA.limit).toBe(5);
    expect(rB.limit).toBe(5);
  });

  // ────────────────────────────────────────────
  // Return shape — both paths
  // ────────────────────────────────────────────

  it("should return identical shape from Redis and memory paths", async () => {
    const expectedKeys = ["success", "remaining", "resetAt", "limit"];

    // Redis path
    mockRedisInstance.eval.mockResolvedValue([2, 58]);
    const redisResult = await checkRateLimit("shape-key-a", 10, 60);

    // Memory path
    mockRedisInstance.eval.mockRejectedValue(new Error("Redis down"));
    const memResult = await checkRateLimit("shape-key-b", 10, 60);

    for (const key of expectedKeys) {
      expect(redisResult).toHaveProperty(key);
      expect(memResult).toHaveProperty(key);
    }

    expect(typeof redisResult.success).toBe(typeof memResult.success);
    expect(typeof redisResult.remaining).toBe(typeof memResult.remaining);
    expect(typeof redisResult.resetAt).toBe(typeof memResult.resetAt);
    expect(typeof redisResult.limit).toBe(typeof memResult.limit);
  });

  it("result.resetAt should be a valid future timestamp in both paths", async () => {
    const now = Date.now();

    // Redis path
    mockRedisInstance.eval.mockResolvedValue([1, 60]);
    const redisResult = await checkRateLimit("time-key-a", 10, 60);
    expect(redisResult.resetAt).toBeGreaterThan(now);

    // Memory path
    mockRedisInstance.eval.mockRejectedValue(new Error("Redis down"));
    const memResult = await checkRateLimit("time-key-b", 10, 60);
    expect(memResult.resetAt).toBeGreaterThan(now);
  });

  // ────────────────────────────────────────────
  // Mixed behavior — Redis starts working again
  // ────────────────────────────────────────────

  it("should use Redis again after a transient failure", async () => {
    // First call: Redis throws
    mockRedisInstance.eval.mockRejectedValueOnce(new Error("Transient error"));

    const memResult = await checkRateLimit("transient-key", 10, 60);
    expect(memResult.limit).toBe(5); // memory 50%

    // Second call: Redis works again
    mockRedisInstance.eval.mockResolvedValue([3, 58]);
    const redisResult = await checkRateLimit("transient-key", 10, 60);
    expect(redisResult.limit).toBe(10); // Redis original limit
    expect(redisResult.success).toBe(true);
    expect(redisResult.remaining).toBe(7);
  });
});
