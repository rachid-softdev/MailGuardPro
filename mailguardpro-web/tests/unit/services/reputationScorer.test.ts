import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock redis
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn(),
  },
}));

// Mock fetch to prevent actual network calls
global.fetch = vi.fn();

import { getDomainAge, getDomainReputation } from "@/services/reputationScorer";

describe("reputationScorer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({}),
    } as any);
  });

  describe("getDomainAge", () => {
    it("should return cached result if available", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ ageInDays: 365 }));

      const result = await getDomainAge("example.com");

      expect(result.ageInDays).toBe(365);
    });

    it("should return known old domain age for popular domains", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);

      const result = await getDomainAge("google.com");

      // Known old domains return default 5 years
      expect(result.ageInDays).toBeGreaterThan(365 * 3);
    });

    it("should return reasonable age for known TLDs", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);

      // .com domains get default 3 years
      const result = await getDomainAge("random-domain.com");

      expect(result.ageInDays).toBe(365 * 3);
    });

    it("should return empty object for unknown TLDs when network fails", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);
      // Mock fetch to return null (network failure)
      vi.mocked(global.fetch).mockResolvedValue(null);

      const result = await getDomainAge("random-domain.xyz");

      // When network fails, returns empty object
      expect(result).toEqual({});
    });
  });

  describe("getDomainReputation", () => {
    it("should return good reputation for old known domains", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);

      const result = await getDomainReputation("google.com");

      expect(result.reputation).toBe("good");
    });

    it("should return neutral for moderately old domains", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ ageInDays: 400 }));

      const result = await getDomainReputation("example.net");

      expect(result.reputation).toBe("neutral");
    });

    it("should return poor for very new domains", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ ageInDays: 15 }));

      const result = await getDomainReputation("new-domain.io");

      expect(result.reputation).toBe("poor");
    });

    it("should include domain name in result", async () => {
      const result = await getDomainReputation("test.com");

      expect(result.name).toBe("test.com");
    });
  });
});
