/**
 * Unit tests for lib/ipHash.ts
 *
 * Tests:
 * - hashIp: HMAC-SHA256 truncated to 16 hex chars
 * - Deterministic output for same IP
 * - Returns raw IP when no key configured
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Use real crypto for hash testing
vi.mock("crypto", async () => {
  const actual = await vi.importActual<typeof import("crypto")>("crypto");
  return { ...actual, default: actual };
});

describe("ipHash", () => {
  beforeEach(() => {
    vi.stubEnv("IP_HASH_KEY", "test-hmac-key-for-deterministic-tests");
    vi.resetModules(); // Ensure each test gets a fresh module import
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("hashIp", () => {
    it("should return a 16-character hex string when IP_HASH_KEY is set", async () => {
      const { hashIp } = await import("@/lib/ipHash");
      const hash = hashIp("192.168.1.1");
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it("should return the same hash for the same IP (deterministic)", async () => {
      const { hashIp } = await import("@/lib/ipHash");
      const hash1 = hashIp("10.0.0.1");
      const hash2 = hashIp("10.0.0.1");
      expect(hash1).toBe(hash2);
    });

    it("should return different hashes for different IPs", async () => {
      const { hashIp } = await import("@/lib/ipHash");
      const hash1 = hashIp("192.168.1.1");
      const hash2 = hashIp("10.0.0.1");
      expect(hash1).not.toBe(hash2);
    });

    it("should return the raw IP when IP_HASH_KEY is not configured", async () => {
      vi.unstubAllEnvs();
      vi.stubEnv("IP_HASH_KEY", "");
      vi.resetModules(); // Force re-import with new env
      const { hashIp } = await import("@/lib/ipHash");
      const result = hashIp("203.0.113.42");
      expect(result).toBe("203.0.113.42");
    });

    it("should handle IPv6 addresses", async () => {
      vi.resetModules(); // Clear module cache to pick up beforeEach env
      const { hashIp } = await import("@/lib/ipHash");
      const hash = hashIp("2001:db8::1");
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it("should warn when IP_HASH_KEY is not defined", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.unstubAllEnvs();
      vi.stubEnv("IP_HASH_KEY", "");
      vi.resetModules(); // Force re-import to trigger module-level warn
      await import("@/lib/ipHash");
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("IP_HASH_KEY"));
      warnSpy.mockRestore();
    });

    it("should produce different hashes with different keys", async () => {
      // IP_HASH_KEY is a module-level constant, so we need resetModules for each import
      vi.stubEnv("IP_HASH_KEY", "key-one");
      vi.resetModules();
      const { hashIp: hashIp1 } = await import("@/lib/ipHash");

      const hash1 = hashIp1("10.0.0.1");

      // Different key — must resetModules to reload module-level constant
      vi.unstubAllEnvs();
      vi.stubEnv("IP_HASH_KEY", "key-two");
      vi.resetModules();
      const { hashIp: hashIp2 } = await import("@/lib/ipHash");

      const hash2 = hashIp2("10.0.0.1");

      // With different keys, same IP should produce different hashes
      expect(hash1).not.toBe(hash2);
    });
  });
});
