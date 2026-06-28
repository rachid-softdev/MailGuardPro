/* eslint-disable @typescript-eslint/no-unused-vars */ import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ──────────────────────────────────────────────────────────────────
//  Module‑level mocks — hoisted before all imports
// ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn(),
  },
}));

vi.mock("dns/promises", () => ({
  default: {
    resolve4: vi.fn().mockResolvedValue(["8.8.8.8"]),
  },
}));

// Default WHOIS: call callback with empty data (no pattern matches → returns null)
// This prevents hanging promises when WHOIS is called unexpectedly.
vi.mock("whois", () => ({
  lookup: vi.fn(
    (
      _domain: string,
      _opts: unknown,
      callback: (err: Error | null, data?: string | { data: string }[]) => void,
    ) => {
      callback(null, "");
    },
  ),
}));

vi.mock("@/lib/ssrf", () => ({
  validateResolvedIp: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

// ──────────────────────────────────────────────────────────────────
//  Global fetch mock
// ──────────────────────────────────────────────────────────────────

global.fetch = vi.fn();

// ──────────────────────────────────────────────────────────────────
//  Imports (after mocks)
// ──────────────────────────────────────────────────────────────────

import { getDomainAge, getDomainReputation } from "@/services/reputationScorer";

// ──────────────────────────────────────────────────────────────────
//  Test helpers
// ──────────────────────────────────────────────────────────────────

/** Build a Response‑like object that simulates a successful RDAP reply. */
function rdapResponse(overrides: Record<string, unknown> = {}): Response {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      events: [{ eventAction: "registration", eventDate: "2010-01-15T00:00:00Z" }],
      ...overrides,
    }),
  } as unknown as Response;
}

/** Build a Response‑like object that simulates a failed HTTP reply. */
function failedResponse(): Response {
  return { ok: false, status: 500, json: vi.fn() } as unknown as Response;
}

/** Pin `Date.now()` so age calculations are deterministic. */
function setNow(iso: string) {
  vi.setSystemTime(new Date(iso));
}

// ──────────────────────────────────────────────────────────────────
//  Suite
// ──────────────────────────────────────────────────────────────────

describe("reputationScorer", () => {
  beforeEach(() => {
    // Fresh fetch mock to eliminate cross‑test leakage of one‑time overrides
    global.fetch = vi.fn();
    vi.mocked(global.fetch).mockResolvedValue(failedResponse());

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ════════════════════════════════════════════════════════════════
  //  getDomainAge
  // ════════════════════════════════════════════════════════════════

  describe("getDomainAge", () => {
    // ── Redis cache ──────────────────────────────────────────────

    it("returns cached result when Redis has the key", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(
        JSON.stringify({ createdAt: "2020-01-01T00:00:00Z", ageInDays: 400 }),
      );

      const result = await getDomainAge("example.com");

      expect(result).toEqual({ createdAt: "2020-01-01T00:00:00Z", ageInDays: 400 });
      expect(redis.get).toHaveBeenCalledWith("domain_age:example.com");
    });

    it("does not call RDAP or WHOIS when cache hits", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ ageInDays: 500 }));

      await getDomainAge("example.com");

      expect(vi.mocked(global.fetch)).not.toHaveBeenCalled();
    });

    it("gracefully continues when Redis.get throws", async () => {
      const { redis } = await import("@/lib/redis");
      // Both calls to redis.get (in getDomainAge and in fetchRDAP) will throw
      vi.mocked(redis.get).mockRejectedValue(new Error("Connection refused"));

      // .xyz → not in known TLDs → RDAP + WHOIS attempted, both fail → {}
      const result = await getDomainAge("example.xyz");

      expect(result).toEqual({});
    });

    it("handles fetch() throwing in fetchWithTimeout (line 71)", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);

      // Make the actual fetch() reject — triggers the catch in fetchWithTimeout
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error("DNS resolution failed"));

      const result = await getDomainAge("test-domain.xyz");

      // fetchWithTimeout catches and returns null → RDAP fails → WHOIS empty → {}
      expect(result).toEqual({});
    });

    it("returns cached result from fetchRDAP internal Redis check (line 110)", async () => {
      const { redis } = await import("@/lib/redis");
      // First call (in getDomainAge): miss → proceeds
      // Second call (inside fetchRDAP): hit → returns cached without API call
      vi.mocked(redis.get)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          JSON.stringify({ ageInDays: 600, createdAt: "2019-01-01T00:00:00Z" }),
        );

      const result = await getDomainAge("test-domain.xyz");

      expect(result.ageInDays).toBe(600);
      expect(result.createdAt).toBe("2019-01-01T00:00:00Z");
      // fetch should NOT have been called (RDAP used its own cache)
      expect(vi.mocked(global.fetch)).not.toHaveBeenCalled();
    });

    // ── Known old domains ────────────────────────────────────────

    it("returns 5+ years for a domain in the KNOWN_OLD_DOMAINS list", async () => {
      const result = await getDomainAge("google.com");

      expect(result.ageInDays).toBe(365 * 5);
      expect(result.createdAt).toBeUndefined();
    });

    it("matches known old domains case‑insensitively", async () => {
      const result = await getDomainAge("GOOGLE.COM");

      expect(result.ageInDays).toBe(365 * 5);
    });

    it("treats known sub‑domain (aws.amazon.com) as old", async () => {
      const result = await getDomainAge("aws.amazon.com");

      expect(result.ageInDays).toBe(365 * 5);
    });

    it("returns 3+ years for any .com domain not in the known list", async () => {
      const result = await getDomainAge("some-random-domain.com");

      expect(result.ageInDays).toBe(365 * 3);
      expect(result.createdAt).toBeUndefined();
    });

    it.each([
      [".net", "example.net"],
      [".org", "example.org"],
      [".io", "example.io"],
      [".co", "example.co"],
      [".edu", "example.edu"],
      [".gov", "example.gov"],
    ])("returns 3+ years for known TLD %s", async (_label, domain) => {
      const result = await getDomainAge(domain);

      expect(result.ageInDays).toBe(365 * 3);
    });

    // ── RDAP success (uses .xyz domains to bypass TLD fallback) ───

    it("parses RDAP response with a valid creation date", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);

      vi.mocked(global.fetch).mockResolvedValueOnce(
        rdapResponse({
          events: [{ eventAction: "registration", eventDate: "2015-06-01T00:00:00Z" }],
        }),
      );

      setNow("2025-06-01T00:00:00Z");
      const result = await getDomainAge("test-domain.xyz");

      expect(result.createdAt).toBe("2015-06-01T00:00:00Z");
      // 10 years incl. leap days 2016, 2020, 2024 = 3653 days
      expect(result.ageInDays).toBe(3653);
    });

    it("accepts RDAP 'creation' event action (alternative name)", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);

      vi.mocked(global.fetch).mockResolvedValueOnce(
        rdapResponse({
          events: [{ eventAction: "creation", eventDate: "2020-01-01T00:00:00Z" }],
        }),
      );

      setNow("2024-01-01T00:00:00Z");
      const result = await getDomainAge("test-domain.xyz");

      expect(result.createdAt).toBe("2020-01-01T00:00:00Z");
      // 4 years incl. leap days 2020, 2024 = 1461 days
      expect(result.ageInDays).toBe(1461);
    });

    it("falls back to ageInDays=365 when RDAP has handle but no creation date", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);

      vi.mocked(global.fetch).mockResolvedValueOnce(
        rdapResponse({
          events: [],
          handle: "DH1234-LRMS",
        }),
      );

      const result = await getDomainAge("test-domain.xyz");

      expect(result.ageInDays).toBe(365);
      expect(result.createdAt).toBeUndefined();
    });

    it("returns empty from RDAP when response has neither events nor handle", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);

      vi.mocked(global.fetch).mockResolvedValueOnce(
        rdapResponse({
          events: [],
          handle: undefined,
        }),
      );

      // parseRdapResponse returns null → fetchRDAP returns null
      // WHOIS also returns null (empty data, no pattern match) → {}
      const result = await getDomainAge("test-domain.xyz");

      expect(result).toEqual({});
    });

    it("calls the correct RDAP URL", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);

      vi.mocked(global.fetch).mockResolvedValueOnce(
        rdapResponse({
          events: [{ eventAction: "registration", eventDate: "2020-01-01T00:00:00Z" }],
        }),
      );

      await getDomainAge("test-domain.xyz");

      expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
        "https://rdap.org/domain/test-domain.xyz",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    // ── RDAP failure, WHOIS fallback ─────────────────────────────

    it("falls back to WHOIS when RDAP fetch returns null (network error)", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);

      // RDAP network failure
      vi.mocked(global.fetch).mockResolvedValueOnce(null as unknown as Response);

      // WHOIS succeeds
      const { lookup } = await import("whois");
      vi.mocked(lookup).mockImplementation((_d, _o, cb) => {
        cb(null, "Creation Date: 2020-06-15T10:30:00Z\n");
      });

      setNow("2025-06-15T00:00:00Z");
      const result = await getDomainAge("test-domain.xyz");

      expect(result.createdAt).toBe("2020-06-15T10:30:00Z");
      // 5 years incl. 1 leap day (2024) minus 10.5h (creation time offset) = 1825 days
      expect(result.ageInDays).toBe(1825);
    });

    it("falls back to WHOIS when RDAP returns HTTP 404", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);

      const { lookup } = await import("whois");
      vi.mocked(lookup).mockImplementation((_d, _o, cb) => {
        cb(null, "created: 2021-03-20T00:00:00Z\n");
      });

      const result = await getDomainAge("test-domain.xyz");

      expect(result.ageInDays).toBeGreaterThan(0);
    });

    it("falls back to WHOIS when RDAP JSON parsing throws", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockRejectedValue(new Error("Unexpected token")),
      } as unknown as Response);

      const { lookup } = await import("whois");
      vi.mocked(lookup).mockImplementation((_d, _o, cb) => {
        cb(null, "Domain Create Date: 2022-01-01T00:00:00Z\n");
      });

      const result = await getDomainAge("test-domain.xyz");

      expect(result.ageInDays).toBeGreaterThan(0);
    });

    // ── WHOIS various data formats ───────────────────────────────

    it.each([
      ["Creation Date", "Creation Date: 2021-01-01T00:00:00Z\n"],
      ["created", "created: 2019-06-15\n"],
      ["Domain Registration Date", "Domain Registration Date: 2020-03-10\n"],
      ["Domain Create Date", "Domain Create Date: 2022-07-01T00:00:00Z\n"],
      ["Registration Time", "Registration Time: 2021-12-01\n"],
      ["registered", "registered: 2018-09-01\n"],
      ["Created on", "Created on: 2023-05-20\n"],
    ])("parses WHOIS pattern '%s'", async (_label, whoisText) => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(global.fetch).mockResolvedValueOnce(null as unknown as Response);

      const { lookup } = await import("whois");
      vi.mocked(lookup).mockImplementation((_d, _o, cb) => {
        cb(null, whoisText);
      });

      const result = await getDomainAge("test-domain.xyz");

      expect(result.ageInDays).toBeGreaterThan(0);
    });

    it("handles WHOIS returning an array of result objects", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(global.fetch).mockResolvedValueOnce(null as unknown as Response);

      const { lookup } = await import("whois");
      vi.mocked(lookup).mockImplementation((_d, _o, cb) => {
        cb(null, [
          { data: "Creation Date: 2023-06-01T00:00:00Z\n" },
          { data: "Registry Data: ...\n" },
        ]);
      });

      const result = await getDomainAge("test-domain.xyz");

      expect(result.ageInDays).toBeGreaterThan(0);
    });

    it("returns null from WHOIS when no date pattern matches", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(global.fetch).mockResolvedValueOnce(null as unknown as Response);

      const { lookup } = await import("whois");
      vi.mocked(lookup).mockImplementation((_d, _o, cb) => {
        cb(null, "Domain Name: example.xyz\nStatus: active\n");
      });

      const result = await getDomainAge("test-domain.xyz");

      // RDAP failed, WHOIS returned null → empty
      expect(result).toEqual({});
    });

    it("handles WHOIS lookup throwing an error", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(global.fetch).mockResolvedValueOnce(null as unknown as Response);

      const { lookup } = await import("whois");
      vi.mocked(lookup).mockImplementation((_d, _o, cb) => {
        cb(new Error("WHOIS server timeout"), null as unknown as string);
      });

      const result = await getDomainAge("test-domain.xyz");

      // WHOIS error is caught and returns null → empty
      expect(result).toEqual({});
    });

    // ── Both RDAP and WHOIS fail ─────────────────────────────────

    it("returns empty object when both RDAP and WHOIS fail", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);

      // RDAP fails
      vi.mocked(global.fetch).mockResolvedValueOnce(null as unknown as Response);

      // WHOIS fails: DNS returns empty array
      const dns = await import("dns/promises");
      vi.mocked(dns.default.resolve4).mockResolvedValueOnce([]);

      const result = await getDomainAge("unknown.xyz");

      expect(result).toEqual({});
    });

    // ── SSRF protection ──────────────────────────────────────────

    it("skips WHOIS when domain resolves to a blocked/private IP", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(global.fetch).mockResolvedValueOnce(null as unknown as Response);

      const { validateResolvedIp } = await import("@/lib/ssrf");
      vi.mocked(validateResolvedIp).mockReturnValueOnce({
        valid: false,
        error: "Blocked private IP range",
      });

      const result = await getDomainAge("test-domain.xyz");

      // WHOIS skipped, RDAP failed → empty
      expect(result).toEqual({});
    });

    it("skips WHOIS when DNS resolution fails (NXDOMAIN)", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(global.fetch).mockResolvedValueOnce(null as unknown as Response);

      const dns = await import("dns/promises");
      vi.mocked(dns.default.resolve4).mockRejectedValue(new Error("ENOTFOUND"));

      const result = await getDomainAge("test-domain.xyz");

      // DNS failed → resolvedIps is null → WHOIS returns null
      // RDAP also failed → empty
      expect(result).toEqual({});
    });

    // ── Redis write after successful fetch ───────────────────────

    it("caches RDAP result in Redis after a successful fetch", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);

      vi.mocked(global.fetch).mockResolvedValueOnce(
        rdapResponse({
          events: [{ eventAction: "registration", eventDate: "2020-01-01T00:00:00Z" }],
        }),
      );

      await getDomainAge("test-domain.xyz");

      expect(redis.setex).toHaveBeenCalledWith(
        "domain_age:test-domain.xyz",
        86400 * 7, // 7 days
        expect.stringContaining("ageInDays"),
      );
    });

    it("does not crash when redis.setex throws after a successful fetch", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(redis.setex).mockRejectedValue(new Error("Write error"));

      vi.mocked(global.fetch).mockResolvedValueOnce(
        rdapResponse({
          events: [{ eventAction: "registration", eventDate: "2020-01-01T00:00:00Z" }],
        }),
      );

      const result = await getDomainAge("test-domain.xyz");

      expect(result.ageInDays).toBeGreaterThan(0);
    });
  });

  // ════════════════════════════════════════════════════════════════
  //  getDomainReputation
  // ════════════════════════════════════════════════════════════════

  describe("getDomainReputation", () => {
    it("returns 'good' for a very old domain (5+ years, .com, no subdomains)", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);

      // google.com → known old → ageInDays = 365*5 = 1825 (> 365*5)
      // score = 50 + 25 + 5 = 80 → "good"
      const result = await getDomainReputation("google.com");

      expect(result.reputation).toBe("good");
      expect(result.ageInDays).toBe(365 * 5);
    });

    it("returns 'good' for a 10+ year old domain (fetched via RDAP)", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);

      // Use .xyz domain to bypass the known‑TLD fallback
      vi.mocked(global.fetch).mockResolvedValueOnce(
        rdapResponse({
          events: [{ eventAction: "registration", eventDate: "2010-01-01T00:00:00Z" }],
        }),
      );

      setNow("2026-01-01T00:00:00Z");
      const result = await getDomainReputation("old-domain.xyz");

      // age > 5 years → +25 ; .xyz NOT in knownTlds → no +5 ; 0 subdomains
      // score = 50 + 25 = 75 → good
      expect(result.reputation).toBe("good");
      expect(result.ageInDays).toBeGreaterThan(365 * 5);
    });

    it("returns 'neutral' for a moderately old domain (~400 days)", async () => {
      const { redis } = await import("@/lib/redis");
      // 400 days → between 365 and 730 → +5
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ ageInDays: 400 }));

      const result = await getDomainReputation("example.net");

      // score = 50 + 5 (age) + 5 (.net) = 60 → neutral
      expect(result.reputation).toBe("neutral");
    });

    it("returns 'poor' for a very new domain (15 days)", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ ageInDays: 15 }));

      const result = await getDomainReputation("new-domain.io");

      // age < 30 → -30 ; .io → +5 ; score = 50 - 30 + 5 = 25 → poor
      expect(result.reputation).toBe("poor");
    });

    it("returns 'good' for an old domain with multiple subdomains", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ ageInDays: 365 * 6 }));

      const result = await getDomainReputation("sub.domain.com");

      // age > 5y → +25 ; .com → +5 ; subdomainCount(2) → +5
      // score = 50 + 25 + 5 + 5 = 85 → good
      expect(result.reputation).toBe("good");
    });

    it("returns 'good' for a domain with many nested subdomains", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ ageInDays: 365 * 4 }));

      const result = await getDomainReputation("a.b.example.com");

      // age > 2y → +15 ; .com → +5 ; subdomainCount(4) → +5
      // score = 50 + 15 + 5 + 5 = 75 → good
      expect(result.reputation).toBe("good");
    });

    it("returns 'neutral' when age info is absent (ageInDays undefined)", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);

      vi.mocked(global.fetch).mockResolvedValueOnce(null as unknown as Response);
      const dns = await import("dns/promises");
      vi.mocked(dns.default.resolve4).mockResolvedValueOnce([]);

      const result = await getDomainReputation("unknown.xyz");

      // no age info → baseline 50 ; .xyz not in knownTlds → no +5
      // score = 50 → neutral
      expect(result.reputation).toBe("neutral");
    });

    it("returns 'poor' for a new domain without a known TLD boost", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ ageInDays: 20 }));

      const result = await getDomainReputation("brand-new.xyz");

      // age < 30 → -30 ; .xyz → not known TLD → no +5
      // score = 50 - 30 = 20 → poor
      expect(result.reputation).toBe("poor");
    });

    it("handles domain in the 30‑89 day range (recent, -15)", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ ageInDays: 60 }));

      const result = await getDomainReputation("example.com");

      // score = 50 - 15 + 5 = 40 → neutral (borderline)
      expect(result.reputation).toBe("neutral");
    });

    it("handles domain in the 90‑179 day range (fairly recent, -5)", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ ageInDays: 120 }));

      const result = await getDomainReputation("example.com");

      // score = 50 - 5 + 5 = 50 → neutral
      expect(result.reputation).toBe("neutral");
    });

    it("returns 'good' for domain in 2‑5 year range with TLD + subdomain bonuses", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ ageInDays: 800 }));

      const result = await getDomainReputation("api.example.com");

      // 800d > 730(2y) but < 1825(5y) → +15
      // .com → +5 ; subdomainCount(2) → +5
      // score = 50 + 15 + 5 + 5 = 75 → good
      expect(result.reputation).toBe("good");
    });

    it("includes the domain name in the returned object", async () => {
      const result = await getDomainReputation("my-test-domain.com");

      expect(result.name).toBe("my-test-domain.com");
    });

    it("includes createdAt when available", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(
        JSON.stringify({ createdAt: "2020-06-01T00:00:00Z", ageInDays: 500 }),
      );

      const result = await getDomainReputation("example.com");

      expect(result.createdAt).toBe("2020-06-01T00:00:00Z");
    });

    it("gracefully handles undefined ageInDays", async () => {
      const { redis } = await import("@/lib/redis");
      vi.mocked(redis.get).mockResolvedValue(null);

      vi.mocked(global.fetch).mockResolvedValueOnce(null as unknown as Response);
      const dns = await import("dns/promises");
      vi.mocked(dns.default.resolve4).mockResolvedValueOnce([]);

      const result = await getDomainReputation("test.xyz");

      expect(result.ageInDays).toBeUndefined();
      expect(result.reputation).toBe("neutral");
    });
  });

  // ════════════════════════════════════════════════════════════════
  //  Edge cases & input sanitisation
  // ════════════════════════════════════════════════════════════════

  describe("edge cases", () => {
    it("handles a domain with one subdomain (mail.google.com) not in known list", async () => {
      // "mail.google.com" is NOT in KNOWN_OLD_DOMAINS (only "google.com" is)
      // But it ends with .com → falls to known TLD → 3+ years
      const result = await getDomainAge("mail.google.com");

      expect(result.ageInDays).toBe(365 * 3);
    });

    it("handles domain with uppercase characters", async () => {
      const result = await getDomainAge("GOOGLE.COM");

      expect(result.ageInDays).toBe(365 * 5);
    });

    it("handles domain with mixed case", async () => {
      const result = await getDomainAge("MicroSoft.COM");

      expect(result.ageInDays).toBe(365 * 5);
    });

    it("works with a domain that has a port number (passed through as‑is)", async () => {
      // The code does NOT strip ports — passes raw string.
      // "example.com:8080" does NOT match ".com" (endsWith("com:8080") → false)
      // Falls through to RDAP/WHOIS. Both fail with default mocks → {}
      const result = await getDomainAge("example.com:8080");

      expect(result).toEqual({});
    });

    it("works with a URL‑style domain (https://… passed as‑is)", async () => {
      // The code does NOT strip protocol prefixes.
      // "https://example.com" endsWith(".com") = true → TLD fallback
      const result1 = await getDomainAge("https://example.com");
      expect(result1.ageInDays).toBe(365 * 3);

      // "https://example.com/path" ends with "/path" → no TLD fallback
      const result2 = await getDomainAge("https://example.com/path");
      expect(result2).toEqual({});
    });
  });
});
