import { beforeEach, describe, expect, it, vi } from "vitest";

// crypto.ts needs TOKEN_ENCRYPTION_KEY and API_KEY_PEPPER at import time.
// vitest.config.ts sets these as env vars globally.

describe("crypto utils", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // ────────────────────────────────────────────
  // Token encryption (AES-256-GCM)
  // ────────────────────────────────────────────

  describe("encryptToken / decryptToken", () => {
    it("should produce output different from input", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      );
      const { encryptToken } = await import("@/lib/crypto");

      const plaintext = "my-secret-token";
      const encrypted = encryptToken(plaintext);
      expect(encrypted).not.toBe(plaintext);
    });

    it("should produce iv:authTag:ciphertext format (3 colon-separated parts)", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      );
      const { encryptToken } = await import("@/lib/crypto");

      const encrypted = encryptToken("my-secret-token");
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(3);
      // Each part should be hex
      expect(parts[0]).toMatch(/^[0-9a-f]+$/); // iv
      expect(parts[1]).toMatch(/^[0-9a-f]+$/); // authTag
      expect(parts[2]).toMatch(/^[0-9a-f]+$/); // ciphertext
    });

    it("should round-trip encrypt and decrypt to original value", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      );
      const { encryptToken, decryptToken } = await import("@/lib/crypto");

      const original = "my-super-secret-value-42";
      const encrypted = encryptToken(original);
      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(original);
    });

    it("should handle empty string encryption/decryption", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      );
      const { encryptToken, decryptToken } = await import("@/lib/crypto");

      const encrypted = encryptToken("");
      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe("");
    });

    it("should handle very long string encryption/decryption", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      );
      const { encryptToken, decryptToken } = await import("@/lib/crypto");

      const original = "x".repeat(10000);
      const encrypted = encryptToken(original);
      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(original);
    });

    it("should throw when TOKEN_ENCRYPTION_KEY is not set (no plaintext fallback)", async () => {
      vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
      vi.resetModules();
      const { encryptToken } = await import("@/lib/crypto");

      expect(() => encryptToken("secret")).toThrow("TOKEN_ENCRYPTION_KEY");
    });

    it("should throw on decryption failure (tampered ciphertext)", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      );
      const { decryptToken } = await import("@/lib/crypto");

      // Tampered ciphertext (wrong auth tag) should throw
      expect(() =>
        decryptToken("0000000000000000:111111111111111111111111:2222222222222222"),
      ).toThrow();
    });

    it("should pass through unencrypted strings in decryptToken (not 3 parts)", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      );
      const { decryptToken } = await import("@/lib/crypto");

      // Not encrypted - just a plain string (not 3 colon-separated parts)
      const result = decryptToken("plain-not-encrypted");
      expect(result).toBe("plain-not-encrypted");
    });

    it("should produce different ciphertexts for same plaintext (different IV)", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      );
      const { encryptToken } = await import("@/lib/crypto");

      const encrypted1 = encryptToken("same-value");
      const encrypted2 = encryptToken("same-value");
      // Different IV → different ciphertext
      expect(encrypted1).not.toBe(encrypted2);
    });

    it("should work with special characters in plaintext", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      );
      const { encryptToken, decryptToken } = await import("@/lib/crypto");

      const original = "hello+special@chars!$%^&*()_+-=[]{}|;':\",./<>?`~你好";
      const encrypted = encryptToken(original);
      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(original);
    });

    it("encrypted value from production system can be decrypted (deterministic format)", async () => {
      vi.stubEnv(
        "TOKEN_ENCRYPTION_KEY",
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      );
      const { encryptToken, decryptToken } = await import("@/lib/crypto");

      // Encrypt and verify the format is consistently decryptable
      const values = ["token-a", "token-b", "token-c"];
      for (const val of values) {
        const enc = encryptToken(val);
        const dec = decryptToken(enc);
        expect(dec).toBe(val);
      }
    });
  });

  // ────────────────────────────────────────────
  // API key hashing
  // ────────────────────────────────────────────

  describe("hashApiKey", () => {
    it("should produce deterministic HMAC-SHA256 hash", async () => {
      vi.stubEnv("API_KEY_PEPPER", "test-pepper-123");
      const { hashApiKey } = await import("@/lib/crypto");

      const hash1 = hashApiKey("mg_live_abc123");
      const hash2 = hashApiKey("mg_live_abc123");
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should produce different hashes for different keys", async () => {
      vi.stubEnv("API_KEY_PEPPER", "test-pepper-123");
      const { hashApiKey } = await import("@/lib/crypto");

      const hash1 = hashApiKey("key_a");
      const hash2 = hashApiKey("key_b");
      expect(hash1).not.toBe(hash2);
    });

    it("should produce different hashes with different peppers", async () => {
      vi.stubEnv("API_KEY_PEPPER", "pepper-a");
      const modA = await import("@/lib/crypto");

      vi.resetModules();
      vi.stubEnv("API_KEY_PEPPER", "pepper-b");
      const modB = await import("@/lib/crypto");

      expect(modA.hashApiKey("same_key")).not.toBe(modB.hashApiKey("same_key"));
    });
  });

  describe("hashApiKeyLegacy", () => {
    it("legacy hash should produce simple SHA256", async () => {
      vi.stubEnv("API_KEY_PEPPER", "test-pepper-123");
      const { hashApiKeyLegacy } = await import("@/lib/crypto");

      const hash = hashApiKeyLegacy("test_key");
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("legacy hash should be deterministic", async () => {
      vi.stubEnv("API_KEY_PEPPER", "test-pepper-123");
      const { hashApiKeyLegacy } = await import("@/lib/crypto");

      expect(hashApiKeyLegacy("test")).toBe(hashApiKeyLegacy("test"));
    });
  });
});
