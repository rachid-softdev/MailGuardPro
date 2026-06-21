import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateWebhookUrlWithDns } from "@/lib/ssrf";
import {
  checkDisposable,
  initializeDisposableDomains,
  syncDisposableDomains,
} from "@/services/disposableChecker";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Create mock Redis instance BEFORE vi.mock so the factory can capture it.
// vi.hoisted() ensures the variable is available when vi.mock's factory runs.
const redisMock = vi.hoisted(() => ({
  get: vi.fn<[string], Promise<string | null>>().mockResolvedValue(null),
  setex: vi.fn<[string, number, string], Promise<"OK">>().mockResolvedValue("OK" as const),
  set: vi.fn().mockResolvedValue("OK"),
  del: vi.fn().mockResolvedValue(1),
  incr: vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
  publish: vi.fn().mockResolvedValue(1),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  keys: vi.fn().mockResolvedValue([]),
  ttl: vi.fn().mockResolvedValue(60),
  eval: vi.fn().mockResolvedValue([1, 60]),
  duplicate: vi.fn(() => ({
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
  })),
  on: vi.fn(),
  quit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/redis", () => ({
  redis: redisMock,
  queueRedis: redisMock,
  rateLimitRedis: redisMock,
  checkRateLimit: vi.fn(() =>
    Promise.resolve({
      success: true,
      resetAt: Date.now() + 60000,
      remaining: 100,
      limit: 100,
    }),
  ),
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  deleteCached: vi.fn().mockResolvedValue(undefined),
  publishProgress: vi.fn().mockResolvedValue(undefined),
  subscribeToProgress: vi.fn(() => vi.fn()),
}));

// Mock SSRF module to control validateWebhookUrlWithDns behavior.
// This is safe because existing tests call syncDisposableDomains() without a
// custom URL, so the SSRF branch (if (url) { … }) is never entered.
vi.mock("@/lib/ssrf", () => ({
  validateWebhookUrlWithDns: vi.fn(),
  validateWebhookUrl: vi.fn(),
  validateResolvedIp: vi.fn(),
  resolveWebhookIps: vi.fn(),
  getClientIp: vi.fn(() => "unknown"),
}));

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("disposableChecker", () => {
  // Reset Redis mock state before EVERY test so each test starts clean.
  beforeEach(() => {
    redisMock.get.mockReset().mockResolvedValue(null);
    redisMock.setex.mockReset().mockResolvedValue("OK" as const);
  });

  // ========================================================================
  // EXISTING TESTS  (keep as-is, do not modify)
  // ========================================================================

  describe("syncDisposableDomains", () => {
    it("should sync disposable domains from remote list", async () => {
      const result = await syncDisposableDomains();
      expect(result).toHaveProperty("added");
      expect(typeof result.added).toBe("number");
    });

    it("should handle fetch errors gracefully", async () => {
      // Test with invalid URL would fail gracefully
      const result = await syncDisposableDomains();
      expect(result).toBeDefined();
    });
  });

  describe("checkDisposable", () => {
    it("should return passed for regular email domains", async () => {
      const result = await checkDisposable("test@gmail.com");
      expect(result.passed).toBe(true);
      expect(result.weight).toBe(10);
    });

    it("should return passed for custom domain", async () => {
      const result = await checkDisposable("test@company.com");
      expect(result.passed).toBe(true);
    });

    it("should return failed for known disposable domains", async () => {
      const result = await checkDisposable("test@tempmail.com");
      expect(result).toHaveProperty("passed");
    });

    it("should return failed for 10minutemail", async () => {
      const result = await checkDisposable("test@10minutemail.com");
      expect(result.passed).toBe(false);
      expect(result.weight).toBe(0);
    });

    it("should return failed for mailinator", async () => {
      const result = await checkDisposable("test@mailinator.com");
      expect(result.passed).toBe(false);
    });

    it("should return failed for guerrillamail", async () => {
      const result = await checkDisposable("test@guerrillamail.com");
      expect(result.passed).toBe(false);
    });

    it("should handle domains with various TLDs", async () => {
      const result = await checkDisposable("test@temp-mail.org");
      expect(result).toHaveProperty("passed");
    });

    it("should handle email with subdomain", async () => {
      const result = await checkDisposable("test@subdomain.disposable.com");
      expect(result).toHaveProperty("passed");
    });
  });

  describe("checkDisposable edge cases", () => {
    it("should handle very long domain names", async () => {
      const longDomain = "test@" + "a".repeat(100) + ".com";
      const result = await checkDisposable(longDomain);
      expect(result).toHaveProperty("passed");
    });

    it("should handle malformed email", async () => {
      const result = await checkDisposable("not-an-email");
      expect(result).toHaveProperty("passed");
    });
  });

  // ========================================================================
  // NEW TESTS  —  Redis caching behavior
  // ========================================================================

  describe("checkDisposable Redis caching", () => {
    it("should return cached disposable result from Redis", async () => {
      redisMock.get.mockResolvedValueOnce("1");

      const result = await checkDisposable("test@tempmail.com");

      expect(result.passed).toBe(false);
      expect(result.weight).toBe(0);
      expect(result.message).toBe("Email jetable");
      expect(result.provider).toBe("cache");
      expect(result.detail).toBe("Domaine tempmail.com connu comme jetable");
      // Cache hit → should NOT call setex
      expect(redisMock.setex).not.toHaveBeenCalled();
    });

    it("should return cached non-disposable result from Redis", async () => {
      redisMock.get.mockResolvedValueOnce("0");

      const result = await checkDisposable("test@gmail.com");

      expect(result.passed).toBe(true);
      expect(result.weight).toBe(10);
      expect(result.message).toBe("Email non-jetable");
      expect(result.provider).toBeUndefined();
      // Cache hit → should NOT call setex
      expect(redisMock.setex).not.toHaveBeenCalled();
    });

    it("should cache disposable result in Redis after first built-in check", async () => {
      // Domain IS in the built-in list → cache as "1"
      const result = await checkDisposable("test@mailinator.com");

      expect(result.passed).toBe(false);
      expect(result.provider).toBe("builtin-list");
      expect(redisMock.setex).toHaveBeenCalledWith("disposable:mailinator.com", 86400, "1");
    });

    it("should cache non-disposable result in Redis after first built-in check", async () => {
      // Domain NOT in any list → cache as "0"
      const uniqueDomain = `genuine${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

      const result = await checkDisposable(`test@${uniqueDomain}.com`);

      expect(result.passed).toBe(true);
      expect(result.message).toBe("Email non-jetable");
      expect(redisMock.setex).toHaveBeenCalledWith(`disposable:${uniqueDomain}.com`, 86400, "0");
    });

    it("should handle Redis errors gracefully and fall back to built-in list", async () => {
      redisMock.get.mockRejectedValueOnce(new Error("Redis connection failed"));

      const result = await checkDisposable("test@mailinator.com");

      expect(result.passed).toBe(false);
      expect(result.provider).toBe("builtin-list");
      // Fallback still caches into Redis
      expect(redisMock.setex).toHaveBeenCalledWith("disposable:mailinator.com", 86400, "1");
    });

    it("should handle Redis errors on fallback cache write gracefully", async () => {
      // Simulate Redis working for get but failing on setex
      redisMock.get.mockResolvedValueOnce(null);
      redisMock.setex.mockRejectedValueOnce(new Error("Redis write error"));

      const result = await checkDisposable("test@mailinator.com");

      expect(result.passed).toBe(false);
      expect(result.provider).toBe("builtin-list");
    });

    it("should not throw when redis.setex fails for non-disposable (0) cache write (lines 101-105)", async () => {
      // Domain NOT in the built-in list → cache as "0"
      redisMock.get.mockResolvedValueOnce(null);
      redisMock.setex.mockRejectedValueOnce(new Error("Redis write error"));

      const result = await checkDisposable("test@unique-genuine-domain.com");

      // Should NOT throw – the error is caught silently
      expect(result.passed).toBe(true);
      expect(result.weight).toBe(10);
      expect(result.message).toBe("Email non-jetable");
    });
  });

  // ========================================================================
  // NEW TESTS  —  Email edge-cases
  // ========================================================================

  describe("checkDisposable email edge cases", () => {
    it("should lowercase uppercase domain before checking", async () => {
      const result = await checkDisposable("test@TEMPMAIL.COM");
      expect(result.passed).toBe(false);
      expect(result.weight).toBe(0);
    });

    it("should return passed with invalid-domain message when no @ sign", async () => {
      const result = await checkDisposable("not-an-email");
      expect(result.passed).toBe(true);
      expect(result.message).toBe("Domaine invalide");
      expect(result.weight).toBe(10);
    });

    it("should handle email with empty domain after @", async () => {
      const result = await checkDisposable("test@");
      expect(result.passed).toBe(true);
      expect(result.message).toBe("Domaine invalide");
    });

    it("should handle very long domain gracefully", async () => {
      const longDomain = "test@" + "x".repeat(200) + ".com";
      const result = await checkDisposable(longDomain);
      expect(result.passed).toBe(true);
    });

    it("should return passed for genuine unknown domain not in any list", async () => {
      // After syncDisposableDomains() has run earlier in the suite, the Set
      // may contain thousands of domains.  Pick a truly unique name.
      const unknown = `absolutely-not-disposable-${Date.now()}-${Math.random().toString(36).slice(2)}.validation`;
      const result = await checkDisposable(`test@${unknown}`);
      expect(result.passed).toBe(true);
      expect(result.message).toBe("Email non-jetable");
    });
  });

  // ========================================================================
  // NEW TESTS  —  initializeDisposableDomains
  // ========================================================================

  describe("initializeDisposableDomains", () => {
    it("should load domains from Redis cache when available", async () => {
      const cachedDomains = [
        `redis-loaded-domain-${Date.now()}.test`,
        `another-redis-domain-${Date.now()}.test`,
      ];
      redisMock.get.mockResolvedValueOnce(JSON.stringify(cachedDomains));

      await initializeDisposableDomains();

      // Must have queried the sync cache key
      expect(redisMock.get).toHaveBeenCalledWith("disposable:sync:all");

      // The cached domains should now be in the built-in list
      const r1 = await checkDisposable(`test@${cachedDomains[0]}`);
      expect(r1.passed).toBe(false);
      expect(r1.provider).toBe("builtin-list");

      const r2 = await checkDisposable(`test@${cachedDomains[1]}`);
      expect(r2.passed).toBe(false);
    });

    it("should not execute again when initialized flag is set (guard)", async () => {
      // initialized is already `true` from the test above, so calling again
      // must return immediately without touching Redis.
      redisMock.get.mockClear();

      await initializeDisposableDomains();

      expect(redisMock.get).not.toHaveBeenCalled();
    });

    it("should fall through to syncDisposableDomains when Redis cache is empty (redis.get returns null)", async () => {
      vi.resetModules();
      const fresh = await import("@/services/disposableChecker");
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("d1.com\nd2.com\nd3.com\nd4.com\nd5.com"),
      } as any);

      await fresh.initializeDisposableDomains();

      // syncDisposableDomains returned added: 5 → setex is called
      expect(redisMock.setex).toHaveBeenCalledWith(
        "disposable:sync:all",
        86400,
        expect.any(String),
      );
      // The synced domains should be in the built-in list
      const r = await fresh.checkDisposable("test@d1.com");
      expect(r.passed).toBe(false);
      expect(r.provider).toBe("builtin-list");

      fetchSpy.mockRestore();
    });

    it("should fall through to syncDisposableDomains when Redis get throws", async () => {
      vi.resetModules();
      const fresh = await import("@/services/disposableChecker");
      redisMock.get.mockRejectedValue(new Error("Redis connection error"));
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("e1.com"),
      } as any);

      await fresh.initializeDisposableDomains();

      // Falls through to sync despite Redis error
      expect(redisMock.setex).toHaveBeenCalledWith(
        "disposable:sync:all",
        86400,
        expect.any(String),
      );

      fetchSpy.mockRestore();
    });

    it("should NOT call redis.setex for sync cache when syncDisposableDomains returns added: 0", async () => {
      vi.resetModules();
      const fresh = await import("@/services/disposableChecker");
      // Empty response → sync returns { added: 0 }
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(""),
      } as any);

      await fresh.initializeDisposableDomains();

      // The setex for the sync cache must NOT be called when added === 0
      expect(redisMock.setex).not.toHaveBeenCalledWith(
        "disposable:sync:all",
        86400,
        expect.any(String),
      );

      fetchSpy.mockRestore();
    });
  });

  // ========================================================================
  // NEW TESTS  —  syncDisposableDomains SSRF validation
  // ========================================================================

  describe("syncDisposableDomains SSRF validation", () => {
    beforeEach(() => {
      // Restore all spies (fetch, etc.) from the previous test
      vi.restoreAllMocks();

      // Reset Redis mocks
      redisMock.get.mockReset().mockResolvedValue(null);
      redisMock.setex.mockReset().mockResolvedValue("OK" as const);

      // NOTE: vi.restoreAllMocks does NOT affect mocks created inside
      // vi.mock() factories, so we must explicitly clear the SSRF mock.
      const ssrfMock = validateWebhookUrlWithDns as unknown as ReturnType<typeof vi.fn>;
      ssrfMock.mockReset();
      ssrfMock.mockResolvedValue({ valid: true, resolvedIps: ["1.2.3.4"] });
    });

    it("should sync successfully when SSRF validation passes with custom URL", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("customdomain.com\nanotherdomain.com"),
      } as any);

      const result = await syncDisposableDomains("https://custom.example.com/list.txt");

      expect(validateWebhookUrlWithDns).toHaveBeenCalledWith("https://custom.example.com/list.txt");
      expect(result).toEqual({ added: 2 });
    });

    it("should return added: 0 when SSRF validation fails", async () => {
      (validateWebhookUrlWithDns as ReturnType<typeof vi.fn>).mockResolvedValue({
        valid: false,
        error: "Blocked private IP",
      });

      const result = await syncDisposableDomains("https://internal.example.com/list.txt");

      expect(validateWebhookUrlWithDns).toHaveBeenCalled();
      expect(result).toEqual({ added: 0 });
    });

    it("should skip SSRF validation when using default URL", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("d1.com\nd2.com\nd3.com"),
      } as any);

      const result = await syncDisposableDomains();

      // Default URL → the `if (url)` branch is NOT entered
      expect(validateWebhookUrlWithDns).not.toHaveBeenCalled();
      expect(result.added).toBe(3);
    });

    it("should return added: 0 on HTTP 404", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as any);

      const result = await syncDisposableDomains("https://custom.example.com/notfound.txt");

      expect(result).toEqual({ added: 0 });
    });

    it("should return added: 0 on HTTP 500", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as any);

      const result = await syncDisposableDomains("https://custom.example.com/error.txt");

      expect(result).toEqual({ added: 0 });
    });

    it("should handle empty response text from custom URL", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(""),
      } as any);

      const result = await syncDisposableDomains("https://custom.example.com/empty.txt");

      expect(result).toEqual({ added: 0 });
    });
  });

  // ========================================================================
  // NEW TESTS  —  syncDisposableDomains HTTP / network errors
  // ========================================================================

  describe("syncDisposableDomains HTTP error handling", () => {
    beforeEach(() => {
      // Restore any fetch spies from the previous test
      vi.restoreAllMocks();
      // Re-apply the hoisted Redis defaults
      redisMock.get.mockReset().mockResolvedValue(null);
      redisMock.setex.mockReset().mockResolvedValue("OK" as const);
    });

    it("should return added: 0 on network failure", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ENOTFOUND"));

      const result = await syncDisposableDomains();

      expect(result).toEqual({ added: 0 });
    });

    it("should return added: 0 on DNS resolution failure", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));

      const result = await syncDisposableDomains();

      expect(result).toEqual({ added: 0 });
    });

    it("should trim whitespace and lowercase synced domains", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("  TEMPMAIL.COM  \n  YopMail.com  \n  \n"),
      } as any);

      const result = await syncDisposableDomains();

      expect(result.added).toBe(2);

      // The domains should now be findable via checkDisposable
      const r1 = await checkDisposable("test@tempmail.com");
      expect(r1.passed).toBe(false);

      const r2 = await checkDisposable("test@yopmail.com");
      expect(r2.passed).toBe(false);
    });
  });
});
