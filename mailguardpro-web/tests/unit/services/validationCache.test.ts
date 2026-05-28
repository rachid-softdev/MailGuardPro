import { beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted to create mock before imports
const { mockRedisInstance } = vi.hoisted(() => ({
  mockRedisInstance: {
    get: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    scan: vi.fn(),
    unlink: vi.fn(),
    eval: vi.fn().mockResolvedValue([1, 3600]),
    duplicate: vi.fn(),
  },
}));

// Mock ioredis
vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => mockRedisInstance),
}));

// Mock @/lib/redis with mock functions
vi.mock("@/lib/redis", () => ({
  redis: mockRedisInstance,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, remaining: 4, resetAt: Date.now() + 3600000, limit: 5 }),
  getCached: vi.fn(),
  setCached: vi.fn(),
  deleteCached: vi.fn(),
  publishProgress: vi.fn(),
  subscribeToProgress: vi.fn(),
}));

import {
  checkEmailRateLimit,
  clearAllValidationCaches,
  getCachedDomainChecks,
  getCachedValidation,
  getRecentValidationCount,
  incrementRecentValidation,
  invalidateValidationCache,
  setCachedDomainChecks,
  setCachedValidation,
} from "@/services/validationCache";

describe("validationCache", () => {
  const mockValidationResult = {
    email: "test@example.com",
    score: 85,
    status: "valid" as const,
    checks: {},
    domain: {},
    processingTimeMs: 100,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCachedValidation", () => {
    it("should return null when cache is empty", async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const result = await getCachedValidation("test@example.com");

      expect(result).toBeNull();
      expect(mockRedisInstance.get).toHaveBeenCalledWith("validation:test@example.com");
    });

    it("should return cached validation result", async () => {
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(mockValidationResult));

      const result = await getCachedValidation("test@example.com");

      expect(result).toEqual(mockValidationResult);
    });

    it("should handle JSON parse errors gracefully", async () => {
      mockRedisInstance.get.mockResolvedValue("invalid-json");

      const result = await getCachedValidation("test@example.com");

      expect(result).toBeNull();
    });

    it("should handle Redis errors gracefully", async () => {
      mockRedisInstance.get.mockRejectedValue(new Error("Redis error"));

      const result = await getCachedValidation("test@example.com");

      expect(result).toBeNull();
    });

    it("should normalize email to lowercase", async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      await getCachedValidation("Test@Example.COM");

      expect(mockRedisInstance.get).toHaveBeenCalledWith("validation:test@example.com");
    });
  });

  describe("setCachedValidation", () => {
    it("should set validation result in cache", async () => {
      mockRedisInstance.setex.mockResolvedValue("OK");

      await setCachedValidation("test@example.com", mockValidationResult);

      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        "validation:test@example.com",
        14400, // 4 hours
        JSON.stringify(mockValidationResult),
      );
    });

    it("should handle Redis errors gracefully", async () => {
      mockRedisInstance.setex.mockRejectedValue(new Error("Redis error"));

      // Should not throw
      await expect(
        setCachedValidation("test@example.com", mockValidationResult),
      ).resolves.not.toThrow();
    });
  });

  describe("invalidateValidationCache", () => {
    it("should delete cached validation", async () => {
      mockRedisInstance.del.mockResolvedValue(1);

      await invalidateValidationCache("test@example.com");

      expect(mockRedisInstance.del).toHaveBeenCalledWith("validation:test@example.com");
    });

    it("should handle Redis errors gracefully", async () => {
      mockRedisInstance.del.mockRejectedValue(new Error("Redis error"));

      await expect(invalidateValidationCache("test@example.com")).resolves.not.toThrow();
    });
  });

  describe("getCachedDomainChecks", () => {
    it("should return null when no cached domain checks", async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const result = await getCachedDomainChecks("example.com");

      expect(result).toBeNull();
    });

    it("should return cached domain checks", async () => {
      const domainChecks = { mx: { passed: true }, spf: { passed: true } };
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(domainChecks));

      const result = await getCachedDomainChecks("example.com");

      expect(result).toEqual(domainChecks);
    });
  });

  describe("setCachedDomainChecks", () => {
    it("should set domain checks in cache", async () => {
      mockRedisInstance.setex.mockResolvedValue("OK");

      const domainChecks = { mx: { passed: true }, spf: { passed: true } };
      await setCachedDomainChecks("example.com", domainChecks);

      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        "domain-checks:example.com",
        7200,
        JSON.stringify(domainChecks),
      );
    });
  });

  describe("getRecentValidationCount", () => {
    it("should return 0 when no recent validations", async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const result = await getRecentValidationCount("test@example.com");

      expect(result).toBe(0);
    });

    it("should return count of recent validations", async () => {
      mockRedisInstance.get.mockResolvedValue("5");

      const result = await getRecentValidationCount("test@example.com");

      expect(result).toBe(5);
    });

    it("should handle parse errors", async () => {
      mockRedisInstance.get.mockResolvedValue("invalid");

      const result = await getRecentValidationCount("test@example.com");

      expect(result).toBeNaN();
    });
  });

  describe("incrementRecentValidation", () => {
    it("should increment and set expiry on first count", async () => {
      mockRedisInstance.incr.mockResolvedValue(1);
      mockRedisInstance.expire.mockResolvedValue(1);

      await incrementRecentValidation("test@example.com");

      expect(mockRedisInstance.incr).toHaveBeenCalledWith("recent-validation:test@example.com");
      expect(mockRedisInstance.expire).toHaveBeenCalledWith(
        "recent-validation:test@example.com",
        3600,
      );
    });

    it("should not set expiry on subsequent increments", async () => {
      mockRedisInstance.incr.mockResolvedValue(5);

      await incrementRecentValidation("test@example.com");

      expect(mockRedisInstance.expire).not.toHaveBeenCalled();
    });
  });

  describe("clearAllValidationCaches", () => {
    it("should clear all validation caches and return count", async () => {
      // First pattern scan returns keys, second returns empty (cursor 0)
      mockRedisInstance.scan
        .mockResolvedValueOnce(["0", ["validation:test1", "validation:test2"]])
        .mockResolvedValueOnce(["0", ["domain-checks:example1"]])
        .mockResolvedValueOnce(["0", ["recent-validation:test"]]);
      mockRedisInstance.unlink.mockResolvedValue(4);

      const result = await clearAllValidationCaches();

      expect(result).toBe(4);
    });

    it("should handle empty caches", async () => {
      mockRedisInstance.scan.mockResolvedValue(["0", []]);

      const result = await clearAllValidationCaches();

      expect(result).toBe(0);
    });

    it("should handle Redis errors and return partial count", async () => {
      mockRedisInstance.scan
        .mockResolvedValueOnce(["0", ["validation:test1"]])
        .mockRejectedValueOnce(new Error("Error"));
      mockRedisInstance.unlink.mockResolvedValue(1);

      const result = await clearAllValidationCaches();

      expect(result).toBe(1);
    });
  });

  describe("checkEmailRateLimit", () => {
    it("should allow request when under limit", async () => {
      const { checkRateLimit } = await import("@/lib/redis");
      vi.mocked(checkRateLimit).mockResolvedValue({
        success: true,
        remaining: 4,
        resetAt: Date.now() + 3600000,
        limit: 5,
      });

      const result = await checkEmailRateLimit("test@example.com");

      expect(result).toBe(true);
    });

    it("should block request when over limit", async () => {
      const { checkRateLimit } = await import("@/lib/redis");
      vi.mocked(checkRateLimit).mockResolvedValue({
        success: false,
        remaining: 0,
        resetAt: Date.now() + 3600000,
        limit: 5,
      });

      const result = await checkEmailRateLimit("test@example.com");

      expect(result).toBe(false);
    });

    it("should normalize email to lowercase", async () => {
      const { checkRateLimit } = await import("@/lib/redis");
      vi.mocked(checkRateLimit).mockResolvedValue({
        success: true,
        remaining: 4,
        resetAt: Date.now() + 3600000,
        limit: 5,
      });

      await checkEmailRateLimit("Test@Example.COM");

      expect(checkRateLimit).toHaveBeenCalledWith("smtp-rate:test@example.com", 5, 3600);
    });

    it("should fail open when Redis is unavailable", async () => {
      const { checkRateLimit } = await import("@/lib/redis");
      vi.mocked(checkRateLimit).mockRejectedValue(new Error("Redis unavailable"));

      const result = await checkEmailRateLimit("test@example.com");

      // Fail-open: returns true (allow) when Redis errors
      expect(result).toBe(true);
    });

    it("should block after 5 requests (rate limit boundary)", async () => {
      const { checkRateLimit } = await import("@/lib/redis");
      // First 5 requests succeed
      vi.mocked(checkRateLimit).mockResolvedValue({
        success: true,
        remaining: 0,
        resetAt: Date.now() + 3600000,
        limit: 5,
      });

      const resultAfter5 = await checkEmailRateLimit("test@example.com");
      expect(resultAfter5).toBe(true);

      // 6th request is blocked
      vi.mocked(checkRateLimit).mockResolvedValue({
        success: false,
        remaining: 0,
        resetAt: Date.now() + 3600000,
        limit: 5,
      });

      const resultAfter6 = await checkEmailRateLimit("test@example.com");
      expect(resultAfter6).toBe(false);
    });
  });
});
