/**
 * Unit tests for lib/emailHash.ts
 *
 * Tests:
 * - hashEmail: SHA-256 hashing with salt, determinism, case-insensitivity
 * - maskEmail: Obfuscated display format
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Use real crypto for hash testing
vi.mock("crypto", async () => {
  const actual = await vi.importActual<typeof import("crypto")>("crypto");
  return { ...actual, default: actual };
});

describe("emailHash", () => {
  beforeEach(() => {
    vi.stubEnv("EMAIL_HASH_SALT", "test-salt-value-for-deterministic-tests");
    vi.resetModules(); // Ensure each test gets a fresh module import
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("hashEmail", () => {
    it("should return a 64-character hex string", async () => {
      const { hashEmail } = await import("@/lib/emailHash");
      const hash = hashEmail("test@example.com");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should return the same hash for the same email (deterministic)", async () => {
      const { hashEmail } = await import("@/lib/emailHash");
      const hash1 = hashEmail("test@example.com");
      const hash2 = hashEmail("test@example.com");
      expect(hash1).toBe(hash2);
    });

    it("should return different hashes for different emails", async () => {
      const { hashEmail } = await import("@/lib/emailHash");
      const hash1 = hashEmail("alice@example.com");
      const hash2 = hashEmail("bob@example.com");
      expect(hash1).not.toBe(hash2);
    });

    it("should be case-insensitive (lowercased before hash)", async () => {
      const { hashEmail } = await import("@/lib/emailHash");
      const hashLower = hashEmail("test@example.com");
      const hashUpper = hashEmail("TEST@EXAMPLE.COM");
      const hashMixed = hashEmail("Test@Example.Com");
      expect(hashLower).toBe(hashUpper);
      expect(hashLower).toBe(hashMixed);
    });

    it("should trim whitespace before hashing", async () => {
      const { hashEmail } = await import("@/lib/emailHash");
      const hashNoSpace = hashEmail("test@example.com");
      const hashWithSpace = hashEmail("  test@example.com  ");
      expect(hashNoSpace).toBe(hashWithSpace);
    });

    it("should produce different hashes with different salts", async () => {
      // First module: uses the salted env from beforeEach ("test-salt-value-for-deterministic-tests")
      const { hashEmail: hashEmailSaltA } = await import("@/lib/emailHash");
      const hashA = hashEmailSaltA("test@example.com");

      // Second module: uses a different salt
      vi.unstubAllEnvs();
      vi.stubEnv("EMAIL_HASH_SALT", "different-salt-value");
      vi.resetModules(); // Force fresh import with new salt
      const { hashEmail: hashEmailSaltB } = await import("@/lib/emailHash");
      const hashB = hashEmailSaltB("test@example.com");

      // Same email with different salts should produce different hashes
      expect(hashA).not.toBe(hashB);

      // Both should still be deterministic
      expect(hashEmailSaltA("test@example.com")).toBe(hashEmailSaltA("test@example.com"));
      expect(hashEmailSaltB("test@example.com")).toBe(hashEmailSaltB("test@example.com"));
    });

    it("should not warn at module import — warn only when function is called", async () => {
      vi.unstubAllEnvs();
      vi.stubEnv("EMAIL_HASH_SALT", "");
      vi.resetModules();
      // Import should NOT trigger warning anymore (M-2 fix)
      const { hashEmail } = await import("@/lib/emailHash");
      // Import logger AFTER loading emailHash to get the same logger instance
      const { logger } = await import("@/lib/logger");
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
      expect(warnSpy).not.toHaveBeenCalled();

      // Warning should fire only when hashEmail is actually called
      hashEmail("test@example.com");
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("EMAIL_HASH_SALT"));
      warnSpy.mockRestore();
    });

    it("should throw in production when EMAIL_HASH_SALT is missing and function is called", async () => {
      // Set both env vars BEFORE resetting modules
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("EMAIL_HASH_SALT", "");
      vi.resetModules();
      const { hashEmail } = await import("@/lib/emailHash");
      // Import should NOT throw — only calling the function should
      expect(() => hashEmail("test@example.com")).toThrow(
        "EMAIL_HASH_SALT is required in production",
      );
      // Restore env vars for subsequent tests
      vi.unstubAllEnvs();
    });
  });

  describe("maskEmail", () => {
    it("should obfuscate the local part of the email", async () => {
      const { maskEmail } = await import("@/lib/emailHash");
      const result = maskEmail("john.doe@example.com");
      expect(result).toBe("j***@example.com");
    });

    it("should handle single-character local part", async () => {
      const { maskEmail } = await import("@/lib/emailHash");
      const result = maskEmail("a@example.com");
      expect(result).toBe("a***@example.com");
    });

    it("should preserve the domain part", async () => {
      const { maskEmail } = await import("@/lib/emailHash");
      const result = maskEmail("test@mailguard.pro");
      expect(result).toContain("@mailguard.pro");
    });

    it("should handle emails with multiple dots in domain", async () => {
      const { maskEmail } = await import("@/lib/emailHash");
      const result = maskEmail("user@sub.domain.co.uk");
      expect(result).toBe("u***@sub.domain.co.uk");
    });
  });
});
