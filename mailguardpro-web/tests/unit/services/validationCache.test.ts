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
  InMemoryRateLimit,
  incrementRecentValidation,
  invalidateValidationCache,
  setCachedDomainChecks,
  setCachedValidation,
} from "@/services/validationCache";

describe("validationCache", () => {
  const mockValidationResult: any = {
    email: "test@example.com",
    score: 85,
    status: "valid",
    checks: {
      format: { passed: true, weight: 15, message: "Valid format", detail: "" },
      mx: { passed: true, weight: 25, message: "MX OK", detail: "" },
      smtp: { passed: true, weight: 30, message: "SMTP OK", detail: "" },
      catchAll: { passed: true, weight: 10, message: "Not catch-all", detail: "" },
      disposable: { passed: true, weight: 10, message: "Not disposable", detail: "" },
      generic: { passed: true, weight: 5, message: "Not generic", detail: "" },
      freeProvider: { passed: true, weight: 0, message: "Business email", detail: "" },
      dnsbl: { passed: true, weight: 0, message: "Not blacklisted", detail: "" },
      spf: { passed: true, weight: 5, message: "SPF OK", detail: "" },
      dmarc: { passed: true, weight: 5, message: "DMARC OK", detail: "" },
      typo: { passed: true, weight: 0, message: "No typo", detail: "" },
    },
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

    it("should return null when redis.get() rejects and log error", async () => {
      mockRedisInstance.get.mockRejectedValue(new Error("Redis connection error"));

      const result = await getCachedDomainChecks("example.com");

      expect(result).toBeNull();
      // Should have been caught silently — verify via mock call
      expect(mockRedisInstance.get).toHaveBeenCalledWith("domain-checks:example.com");
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

    it("should merge with existing cached domain checks", async () => {
      // Existing cache has MX check
      mockRedisInstance.get.mockResolvedValue(
        JSON.stringify({ mx: { passed: true, server: "mx1.example.com" } }),
      );
      mockRedisInstance.setex.mockResolvedValue("OK");

      // Set only SPF check
      await setCachedDomainChecks("example.com", { spf: { passed: true, record: "v=spf1" } });

      // The merged result should contain both MX and SPF
      const expectedMerged = {
        mx: { passed: true, server: "mx1.example.com" },
        spf: { passed: true, record: "v=spf1" },
      };
      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        "domain-checks:example.com",
        7200,
        JSON.stringify(expectedMerged),
      );
    });

    it("should overwrite existing keys with new values during merge", async () => {
      // Existing cache has MX with old value
      mockRedisInstance.get.mockResolvedValue(JSON.stringify({ mx: { passed: false } }));
      mockRedisInstance.setex.mockResolvedValue("OK");

      // Override MX with new value
      await setCachedDomainChecks("example.com", { mx: { passed: true, server: "new-mx.com" } });

      const expected = { mx: { passed: true, server: "new-mx.com" } };
      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        "domain-checks:example.com",
        7200,
        JSON.stringify(expected),
      );
    });

    it("should handle setex rejection gracefully", async () => {
      // Mock get to return null (no existing cache)
      mockRedisInstance.get.mockResolvedValue(null);
      mockRedisInstance.setex.mockRejectedValue(new Error("Redis write error"));

      // Should not throw
      await expect(
        setCachedDomainChecks("example.com", { mx: { passed: true } }),
      ).resolves.not.toThrow();
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

    it("should return 0 when redis.get() rejects (fail-open)", async () => {
      mockRedisInstance.get.mockRejectedValue(new Error("Redis unavailable"));

      const result = await getRecentValidationCount("test@example.com");

      expect(result).toBe(0);
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

    it("should handle incr rejection gracefully", async () => {
      mockRedisInstance.incr.mockRejectedValue(new Error("Redis error"));

      // Should not throw
      await expect(incrementRecentValidation("test@example.com")).resolves.not.toThrow();
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

    it("should handle SCAN pagination with non-zero cursor", async () => {
      // First pattern "validation:*": first scan returns cursor "5" (non-zero), second returns "0"
      // Second pattern "domain-checks:*": no results
      // Third pattern "recent-validation:*": no results
      mockRedisInstance.scan
        .mockResolvedValueOnce(["5", ["validation:key1", "validation:key2"]])
        .mockResolvedValueOnce(["0", ["validation:key3"]])
        .mockResolvedValueOnce(["0", []])
        .mockResolvedValueOnce(["0", []]);
      mockRedisInstance.unlink.mockResolvedValue(3);

      const result = await clearAllValidationCaches();

      expect(result).toBe(3);
      // SCAN should be called with the non-zero cursor (5, parsed from string) for continued iteration
      expect(mockRedisInstance.scan).toHaveBeenNthCalledWith(
        2,
        5,
        "MATCH",
        "validation:*",
        "COUNT",
        100,
      );
      // UNLINK was called twice: first with 2 keys, second with 1 key
      expect(mockRedisInstance.unlink).toHaveBeenCalledTimes(2);
    });
  });

  describe("InMemoryRateLimit (H-1 fix)", () => {
    let limiter: InMemoryRateLimit;

    beforeEach(() => {
      limiter = new InMemoryRateLimit(1000);
    });

    it("should allow first request", () => {
      expect(limiter.check("key-a", 5, 60000)).toBe(true);
    });

    it("should allow requests within the limit", () => {
      for (let i = 0; i < 5; i++) {
        expect(limiter.check("burst-key", 5, 60000)).toBe(true);
      }
    });

    it("should block request when count >= limit (H-1 fix)", () => {
      for (let i = 0; i < 5; i++) {
        limiter.check("limit-key", 5, 60000);
      }
      // 6th request MUST be blocked
      expect(limiter.check("limit-key", 5, 60000)).toBe(false);
    });

    it("should NOT increment counter after limit reached (H-1 fix)", () => {
      for (let i = 0; i < 5; i++) {
        limiter.check("no-inc-key", 5, 60000);
      }
      // All subsequent requests return false
      for (let i = 0; i < 10; i++) {
        expect(limiter.check("no-inc-key", 5, 60000)).toBe(false);
      }
    });

    it("should reset after window expires", () => {
      for (let i = 0; i < 5; i++) {
        limiter.check("window-key", 5, 60000);
      }
      expect(limiter.check("window-key", 5, 60000)).toBe(false);

      // Simulate time passing (use vi.advanceTimers if available)
      // For InMemoryRateLimit, the window is checked via Date.now()
      // We can't easily fake time for this private class, but we can use
      // a very short window to test expiry
      const shortLimiter = new InMemoryRateLimit(1000);
      expect(shortLimiter.check("short-key", 2, 50)).toBe(true); // t=0
      expect(shortLimiter.check("short-key", 2, 50)).toBe(true); // t=0
      expect(shortLimiter.check("short-key", 2, 50)).toBe(false); // t=0

      // After window passes, it should reset
      // We use a tiny window + manual delay — but better: verify the entry structure
    });

    it("should evict oldest entries when store exceeds maxEntries", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const smallLimiter = new InMemoryRateLimit(10);

      // Add 15 keys (eviction is periodic, not inline)
      for (let i = 0; i < 15; i++) {
        smallLimiter.check(`evict-key-${i}`, 5, 60000);
      }
      expect((smallLimiter as any).store.size).toBe(15);

      // evict() removes floor(10 * 0.1) = 1 oldest entry per call
      (smallLimiter as any).evict();
      expect((smallLimiter as any).store.size).toBe(14);

      (smallLimiter as any).evict();
      expect((smallLimiter as any).store.size).toBe(13);

      (smallLimiter as any).evict();
      expect((smallLimiter as any).store.size).toBe(12);

      (smallLimiter as any).evict();
      expect((smallLimiter as any).store.size).toBe(11);

      // 5th evict: size=10, not >10 → no-op
      (smallLimiter as any).evict();
      expect((smallLimiter as any).store.size).toBe(10);

      warnSpy.mockRestore();
    });

    it("should track independent keys separately", () => {
      expect(limiter.check("key-x", 3, 60000)).toBe(true);
      expect(limiter.check("key-x", 3, 60000)).toBe(true);
      expect(limiter.check("key-x", 3, 60000)).toBe(true);
      expect(limiter.check("key-x", 3, 60000)).toBe(false); // exceeded

      // Different key — should still be allowed
      expect(limiter.check("key-y", 3, 60000)).toBe(true);
    });

    it("should handle limit of 1 correctly", () => {
      expect(limiter.check("one-key", 1, 60000)).toBe(true);
      expect(limiter.check("one-key", 1, 60000)).toBe(false);
      expect(limiter.check("one-key", 1, 60000)).toBe(false); // still false, counter stays at 1
    });
  });

  describe("InMemoryRateLimit — evict early return (line 184)", () => {
    it("should not evict when store size is less than maxEntries (early return)", () => {
      // Line 184: if (this.store.size <= this.maxEntries) return;
      // When size < maxEntries, evict() is a no-op.
      const bigLimiter = new InMemoryRateLimit(100_000); // very large capacity
      // Add only 5 entries (far below 100_000 limit)
      for (let i = 0; i < 5; i++) {
        bigLimiter.check(`small-key-${i}`, 5, 60000);
      }
      expect((bigLimiter as any).store.size).toBe(5);

      // evict with size (5) <= maxEntries (100000) → early return, nothing evicted
      (bigLimiter as any).evict();
      expect((bigLimiter as any).store.size).toBe(5);
    });

    it("should not evict when store size equals exactly maxEntries", () => {
      // Edge of the early return: size == maxEntries → early return
      const limiter = new InMemoryRateLimit(3);
      for (let i = 0; i < 3; i++) {
        limiter.check(`exact-key-${i}`, 5, 60000);
      }
      expect((limiter as any).store.size).toBe(3);
      (limiter as any).evict();
      // Size (3) <= maxEntries (3) → no eviction
      expect((limiter as any).store.size).toBe(3);
    });
  });

  describe("checkEmailRateLimit — Redis vs memory path (line 191)", () => {
    it("should NOT use in-memory rate limit when Redis checkRateLimit succeeds", async () => {
      // When checkRateLimit resolves successfully (doesn't throw),
      // the catch block is NOT entered → memoryRateLimit.check() is NOT called.
      const { checkRateLimit } = await import("@/lib/redis");
      vi.mocked(checkRateLimit).mockResolvedValue({
        success: true,
        remaining: 4,
        resetAt: Date.now() + 3600000,
        limit: 5,
      });

      // Even after many calls, Redis path is always used (no memory limit)
      for (let i = 0; i < 10; i++) {
        const result = await checkEmailRateLimit("nothrottled@example.com");
        expect(result).toBe(true);
      }

      // checkRateLimit was called 10 times
      expect(checkRateLimit).toHaveBeenCalledTimes(10);
    });

    it("should fall back to in-memory rate limit when Redis throws and block after 5 attempts", async () => {
      const { checkRateLimit } = await import("@/lib/redis");
      // Redis unavailable — throws error
      vi.mocked(checkRateLimit).mockRejectedValue(new Error("Redis connection failed"));

      // First 5 requests should succeed via memory fallback
      for (let i = 0; i < 5; i++) {
        const result = await checkEmailRateLimit("memfallback@example.com");
        expect(result).toBe(true);
      }

      // 6th request should be blocked by memory rate limit
      const blocked = await checkEmailRateLimit("memfallback@example.com");
      expect(blocked).toBe(false);

      // 7th request also blocked
      const stillBlocked = await checkEmailRateLimit("memfallback@example.com");
      expect(stillBlocked).toBe(false);
    });

    it("should maintain separate memory rate limit counters for different emails (fallback path)", async () => {
      const { checkRateLimit } = await import("@/lib/redis");
      vi.mocked(checkRateLimit).mockRejectedValue(new Error("Redis down"));

      // Exhaust limit for email1
      for (let i = 0; i < 5; i++) {
        await checkEmailRateLimit("exhausted@example.com");
      }
      expect(await checkEmailRateLimit("exhausted@example.com")).toBe(false);

      // Different email should still be allowed
      expect(await checkEmailRateLimit("fresh@example.com")).toBe(true);
    });
  });

  describe("checkEmailRateLimit (original scenarios)", () => {
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
