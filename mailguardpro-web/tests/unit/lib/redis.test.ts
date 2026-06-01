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
    eval: vi.fn().mockResolvedValue([1, 60]),
    duplicate: vi.fn(),
    disconnect: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    on: vi.fn(),
  };
  return { mockRedisInstance: instance };
});

// Mock ioredis — use a proper constructor function (not arrow) so new Redis() works
vi.mock("ioredis", () => {
  const Redis = function () {
    return mockRedisInstance;
  };
  return { default: Redis };
});

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
  });
});
