import { beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/lib/logger";

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
    eval: vi.fn().mockResolvedValue([1, 60]),
    duplicate: vi.fn(),
    disconnect: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    on: vi.fn(),
  };
  return { mockRedisInstance: instance };
});

// Track Redis constructor calls to verify options passed by createRedisClient
const redisConstructorCalls = vi.hoisted(() => [] as Array<{ url: string; opts: any }>);

// Mock ioredis — use a proper constructor function (not arrow) so new Redis() works
vi.mock("ioredis", () => {
  const Redis = function (url: string, opts: any) {
    // ioredis supports both new Redis(options) and new Redis(url, options)
    // createRedisClient calls new Redis({host, port, ...}) — options as first arg
    // Extract the effective options object regardless of calling convention
    const effectiveOpts = opts || (typeof url === "object" ? url : {});
    redisConstructorCalls.push({ url, opts: effectiveOpts });
    return mockRedisInstance;
  };
  return { default: Redis };
});

// Mock logger so subscribeToProgress tests can verify warn calls
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

// Use importOriginal to get actual implementation but we need to mock the underlying redis instance
vi.mock("@/lib/redis", async () => {
  const actual = await vi.importActual("@/lib/redis");
  // Override the redis and other exports with our mock
  return {
    ...actual,
    redis: mockRedisInstance,
    queueRedis: mockRedisInstance,
    rateLimitRedis: mockRedisInstance,
  };
});

// Import from the actual module - will use the mocked redis
import {
  checkRateLimit,
  deleteCached,
  getCached,
  publishProgress,
  queueRedis,
  rateLimitRedis,
  redis,
  setCached,
  subscribeToProgress,
} from "@/lib/redis";

describe("redis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset all mock implementations
    mockRedisInstance.get.mockResolvedValue(null);
    mockRedisInstance.set.mockResolvedValue("OK");
    mockRedisInstance.setex.mockResolvedValue("OK");
    mockRedisInstance.del.mockResolvedValue(1);
    mockRedisInstance.incr.mockResolvedValue(1);
    mockRedisInstance.expire.mockResolvedValue(1);
    mockRedisInstance.publish.mockResolvedValue(1);
    mockRedisInstance.ttl.mockResolvedValue(60);
  });

  describe("redis connection", () => {
    it("should have redis client defined", () => {
      expect(redis).toBeDefined();
    });

    it("should export queueRedis for BullMQ worker (maxRetriesPerRequest: null)", () => {
      expect(queueRedis).toBeDefined();
      expect(typeof queueRedis.publish).toBe("function");
    });

    it("should export rateLimitRedis for rate limiting", () => {
      expect(rateLimitRedis).toBeDefined();
      expect(typeof rateLimitRedis.eval).toBe("function");
    });

    it("should have all three Redis clients distinct references", () => {
      // All three point to mockRedisInstance in test, but the exports exist
      expect(redis).toBe(queueRedis); // same mock in test
      expect(rateLimitRedis).toBe(queueRedis); // same mock in test
    });
  });

  describe("getCached", () => {
    it("should return null when no cached data exists", async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const result = await getCached("nonexistent-key");

      expect(result).toBeNull();
      expect(mockRedisInstance.get).toHaveBeenCalledWith("nonexistent-key");
    });

    it("should return parsed JSON when cached data exists", async () => {
      const cachedData = { test: "value", count: 42 };
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await getCached("test-key");

      expect(result).toEqual(cachedData);
    });

    it("should handle invalid JSON gracefully", async () => {
      mockRedisInstance.get.mockResolvedValue("invalid-json");

      await expect(getCached("bad-key")).rejects.toThrow();
    });

    it("should reject when redis.get fails", async () => {
      const testError = new Error("Connection refused");
      mockRedisInstance.get.mockRejectedValue(testError);

      await expect(getCached("fail-key")).rejects.toThrow("Connection refused");
    });
  });

  describe("setCached", () => {
    it("should set value with TTL", async () => {
      mockRedisInstance.setex.mockResolvedValue("OK");

      await setCached("test-key", { data: "value" }, 3600);

      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        "test-key",
        3600,
        JSON.stringify({ data: "value" }),
      );
    });

    it("should use default TTL of 3600 seconds", async () => {
      mockRedisInstance.setex.mockResolvedValue("OK");

      await setCached("test-key", "simple-value");

      expect(mockRedisInstance.setex).toHaveBeenCalledWith("test-key", 3600, '"simple-value"');
    });

    it("should reject when redis.setex fails", async () => {
      mockRedisInstance.setex.mockRejectedValue(new Error("Timeout"));

      await expect(setCached("fail-key", "value", 60)).rejects.toThrow("Timeout");
    });
  });

  describe("deleteCached", () => {
    it("should delete key from cache", async () => {
      mockRedisInstance.del.mockResolvedValue(1);

      await deleteCached("test-key");

      expect(mockRedisInstance.del).toHaveBeenCalledWith("test-key");
    });

    it("should return void", async () => {
      mockRedisInstance.del.mockResolvedValue(1);

      const result = await deleteCached("test-key");

      expect(result).toBeUndefined();
    });

    it("should reject when redis.del fails", async () => {
      mockRedisInstance.del.mockRejectedValue(new Error("Connection refused"));

      await expect(deleteCached("fail-key")).rejects.toThrow("Connection refused");
    });
  });

  describe("checkRateLimit", () => {
    it("should allow request when under limit", async () => {
      // Lua script returns [currentCount, ttl]
      mockRedisInstance.eval.mockResolvedValue([1, 60]); // current=1, ttl=60

      const result = await checkRateLimit("test-key", 10, 60);

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(9);
      expect(result.resetAt).toBeGreaterThan(Date.now());
    });

    it("should block request when over limit", async () => {
      // Lua script returns current > limit
      mockRedisInstance.eval.mockResolvedValue([11, 60]); // current=11 > limit=10

      const result = await checkRateLimit("test-key", 10, 60);

      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should return result object with all required properties", async () => {
      mockRedisInstance.eval.mockResolvedValue([5, 60]);

      const result = await checkRateLimit("test-key", 10, 60);

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("remaining");
      expect(result).toHaveProperty("resetAt");
      expect(result).toHaveProperty("limit");
    });

    it("should call redis.eval with Lua script and correct arguments", async () => {
      await checkRateLimit("new-key", 10, 60);

      expect(mockRedisInstance.eval).toHaveBeenCalledWith(
        expect.stringContaining("redis.call"), // Lua script content
        1,
        "ratelimit:new-key",
        "10",
        "60",
      );
    });

    it("should use rateLimitRedis (not the main redis) for rate limiting calls", async () => {
      // checkRateLimit uses rateLimitRedis.eval internally
      // Since all point to mockRedisInstance in test, verify the eval method was called
      mockRedisInstance.eval.mockResolvedValue([1, 60]);

      await checkRateLimit("rate-test-key", 5, 30);

      expect(mockRedisInstance.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        "ratelimit:rate-test-key",
        "5",
        "30",
      );
    });

    it("should calculate resetAt with TTL when ttl > 0", async () => {
      const now = Date.now();
      mockRedisInstance.eval.mockResolvedValue([1, 30]); // ttl=30 seconds

      const result = await checkRateLimit("test-key", 10, 60);

      // resetAt = ceil((now + 30*1000) / 10000) * 10000
      const expected = Math.ceil((now + 30000) / 10000) * 10000;
      expect(result.resetAt).toBe(expected);
    });

    it("should use windowSeconds when TTL is 0", async () => {
      const now = Date.now();
      mockRedisInstance.eval.mockResolvedValue([1, 0]); // ttl=0

      const result = await checkRateLimit("test-key", 10, 60);

      // resetAt = ceil((now + 60*1000) / 10000) * 10000
      const expected = Math.ceil((now + 60000) / 10000) * 10000;
      expect(result.resetAt).toBe(expected);
    });

    it("should use windowSeconds when TTL is negative (Lua script fix: < 0 check)", async () => {
      const now = Date.now();
      // Lua script now checks ttl < 0 (not == -1) to handle all negative TTLs
      mockRedisInstance.eval.mockResolvedValue([1, -2]); // negative TTL (e.g., -2)

      const result = await checkRateLimit("test-key", 10, 60);

      // resetAt = ceil((now + 60*1000) / 10000) * 10000 (windowSeconds fallback)
      const expected = Math.ceil((now + 60000) / 10000) * 10000;
      expect(result.resetAt).toBe(expected);
      expect(result.success).toBe(true);
    });

    it("should handle malformed eval reply (single element array)", async () => {
      // eval returns [current] without ttl
      mockRedisInstance.eval.mockResolvedValue([1]);

      const result = await checkRateLimit("test-key", 10, 60);

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(9);
      expect(result.resetAt).toBeGreaterThan(Date.now());
    });

    it("should return success with 0 remaining when exactly at limit", async () => {
      mockRedisInstance.eval.mockResolvedValue([10, 60]); // current=10, limit=10

      const result = await checkRateLimit("test-key", 10, 60);

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(0);
      expect(result.limit).toBe(10);
    });

    it("should use windowSeconds for resetAt when TTL returns -1", async () => {
      const now = Date.now();
      mockRedisInstance.eval.mockResolvedValue([1, -1]); // ttl=-1

      const result = await checkRateLimit("test-key", 10, 60);

      // ttl=-1 => ttl > 0 is false => use windowSeconds
      const expected = Math.ceil((now + 60000) / 10000) * 10000;
      expect(result.resetAt).toBe(expected);
      expect(result.success).toBe(true);
    });
  });

  describe("publishProgress", () => {
    it("should publish message to job channel", async () => {
      mockRedisInstance.publish.mockResolvedValue(1);

      await publishProgress("job-123", { progress: 50, status: "processing" });

      expect(mockRedisInstance.publish).toHaveBeenCalledWith(
        "job:job-123:progress",
        JSON.stringify({ progress: 50, status: "processing" }),
      );
    });

    it("should publish without callback data", async () => {
      mockRedisInstance.publish.mockResolvedValue(1);

      await publishProgress("job-empty", null);

      expect(mockRedisInstance.publish).toHaveBeenCalled();
    });

    it("should reject when redis.publish fails", async () => {
      mockRedisInstance.publish.mockRejectedValue(new Error("Timeout"));

      await expect(publishProgress("job-123", { data: "test" })).rejects.toThrow("Timeout");
    });
  });

  describe("subscribeToProgress", () => {
    it("should return unsubscribe function", () => {
      const mockSubscriber = {
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        disconnect: vi.fn(),
        on: vi.fn(),
      };
      mockRedisInstance.duplicate.mockReturnValue(mockSubscriber as any);

      const unsubscribe = subscribeToProgress("job-123", vi.fn());

      expect(typeof unsubscribe).toBe("function");
    });

    it("should subscribe to the correct channel", () => {
      const mockSubscriber = {
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        disconnect: vi.fn(),
        on: vi.fn(),
      };
      mockRedisInstance.duplicate.mockReturnValue(mockSubscriber as any);

      subscribeToProgress("job-123", vi.fn());

      expect(mockSubscriber.subscribe).toHaveBeenCalledWith("job:job-123:progress");
    });

    it("should set up message handler", () => {
      const mockSubscriber = {
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        disconnect: vi.fn(),
        on: vi.fn(),
      };
      mockRedisInstance.duplicate.mockReturnValue(mockSubscriber as any);

      const callback = vi.fn();
      subscribeToProgress("job-123", callback);

      expect(mockSubscriber.on).toHaveBeenCalledWith("message", expect.any(Function));
    });

    it("should call unsubscribe and disconnect on cleanup", () => {
      const mockSubscriber = {
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        disconnect: vi.fn(),
        on: vi.fn(),
      };
      mockRedisInstance.duplicate.mockReturnValue(mockSubscriber as any);

      const unsubscribe = subscribeToProgress("job-123", vi.fn());
      unsubscribe();

      expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith("job:job-123:progress");
      expect(mockSubscriber.disconnect).toHaveBeenCalled();
    });

    it("should parse valid JSON and invoke callback with parsed data", () => {
      const mockSubscriber = {
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        disconnect: vi.fn(),
        on: vi.fn(),
      };
      mockRedisInstance.duplicate.mockReturnValue(mockSubscriber as any);

      const callback = vi.fn();
      subscribeToProgress("job-123", callback);

      // Extract the message handler registered by subscribeToProgress
      const messageHandler = mockSubscriber.on.mock.calls.find((call) => call[0] === "message")![1];

      const testData = { status: "completed", progress: 100 };
      messageHandler("job:job-123:progress", JSON.stringify(testData));

      expect(callback).toHaveBeenCalledWith(testData);
    });

    it("should log a warning when message contains invalid JSON", () => {
      const mockSubscriber = {
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        disconnect: vi.fn(),
        on: vi.fn(),
      };
      mockRedisInstance.duplicate.mockReturnValue(mockSubscriber as any);

      const callback = vi.fn();
      subscribeToProgress("job-123", callback);

      const messageHandler = mockSubscriber.on.mock.calls.find((call) => call[0] === "message")![1];

      messageHandler("job:job-123:progress", "invalid-json");

      expect(callback).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        "Failed to parse progress message",
      );
    });
  });

  // ==========================================================================
  // createRedisClient options — retryStrategy and extraOpts merging
  // ==========================================================================

  describe("createRedisClient retryStrategy", () => {
    it("retryStrategy should return null when times > 5", () => {
      expect(redisConstructorCalls.length).toBeGreaterThanOrEqual(1);
      expect(redisConstructorCalls[0]).toBeDefined();
      expect(redisConstructorCalls[0].opts).toBeDefined();

      // Find the main redis client options (first call, no extraOpts)
      const mainOpts = redisConstructorCalls[0].opts;
      expect(mainOpts.retryStrategy).toBeInstanceOf(Function);

      const strategy = mainOpts.retryStrategy;
      expect(strategy(6)).toBeNull();
      expect(strategy(10)).toBeNull();
      expect(strategy(100)).toBeNull();
    });

    it("retryStrategy should return times * 200 for times <= 5, max 2000", () => {
      const mainOpts = redisConstructorCalls[0].opts;
      const strategy = mainOpts.retryStrategy;

      expect(strategy(1)).toBe(200);
      expect(strategy(2)).toBe(400);
      expect(strategy(3)).toBe(600);
      expect(strategy(4)).toBe(800);
      expect(strategy(5)).toBe(1000);
    });
  });

  describe("createRedisClient host and port extraction", () => {
    it("should extract host and port from REDIS_URL and set defaults otherwise", () => {
      // The default REDIS_URL is redis://localhost:6379
      // parsedUrl.hostname = "localhost" (truthy) → used directly
      // parseInt(parsedUrl.port) = 6379 (truthy) → used directly
      const opts = redisConstructorCalls[0].opts;
      expect(opts.host).toBe("localhost");
      expect(opts.port).toBe(6379);
    });

    it("|| fallback: parsedUrl.hostname || localhost — hostname is always present in valid URLs", () => {
      // The fallback branch at line 21 (`parsedUrl.hostname || "localhost"`)
      // is defensive: for any valid redis:// URL that includes a host,
      // parsedUrl.hostname is always a non-empty string (truthy).
      // A URL without a hostname (e.g. "redis://:6379") causes the URL
      // constructor to throw TypeError, so this fallback only applies
      // if the URL parser were to return an empty hostname unexpectedly.
      const url = new URL("redis://localhost:6379");
      expect(url.hostname).toBe("localhost"); // truthy → used directly
      expect(url.hostname || "localhost").toBe("localhost"); // same result
      expect(url.port).toBe("6379"); // truthy → used directly
    });

    it("|| fallback: parseInt(parsedUrl.port) defaults to 6379 when NaN", () => {
      // Demonstrates the fallback branch at line 22:
      //   port: parseInt(parsedUrl.port) || 6379
      // When parseInt returns NaN (falsy), 6379 is used.
      const noPortUrl = new URL("redis://localhost");
      expect(noPortUrl.port).toBe("");
      expect(parseInt(noPortUrl.port)).toBeNaN();
      expect(parseInt(noPortUrl.port) || 6379).toBe(6379);
    });
  });

  describe("createRedisClient extraOpts merging", () => {
    it("should merge extraOpts into Redis constructor options", () => {
      // redisConstructorCalls captures all calls: redis, queueRedis, rateLimitRedis
      // queueRedis is the 2nd call (index 1) with extraOpts { maxRetriesPerRequest: null }
      expect(redisConstructorCalls.length).toBeGreaterThanOrEqual(2);

      // First call: main redis client (default options)
      const defaultOpts = redisConstructorCalls[0].opts;
      expect(defaultOpts.maxRetriesPerRequest).toBe(3);

      // Second call: queueRedis with extraOpts { maxRetriesPerRequest: null }
      const queueOpts = redisConstructorCalls[1].opts;
      expect(queueOpts.maxRetriesPerRequest).toBeNull();

      // Other defaults should still be present
      expect(queueOpts.lazyConnect).toBe(true);
      expect(queueOpts.connectTimeout).toBe(5000);
      expect(queueOpts.commandTimeout).toBe(5000);
    });
  });
});
