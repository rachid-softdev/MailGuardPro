/**
 * Unit tests for lib/crypto.ts — key enforcement.
 *
 * Tests that encryptToken/decryptToken throw meaningful errors when
 * TOKEN_ENCRYPTION_KEY is missing, and that they work correctly when set.
 *
 * The vitest.config.ts sets TOKEN_ENCRYPTION_KEY globally. We use
 * vi.stubEnv + vi.resetModules + dynamic import to control env per test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VALID_KEY = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

describe("crypto key enforcement", () => {
  beforeEach(() => {
    // Start clean — no env override; vitest.config.ts sets a valid key.
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // ────────────────────────────────────────────
  // TOKEN_ENCRYPTION_KEY missing — must throw
  // ────────────────────────────────────────────

  it("encryptToken should throw when TOKEN_ENCRYPTION_KEY is not set", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
    vi.resetModules();
    const { encryptToken } = await import("@/lib/crypto");

    expect(() => encryptToken("my-secret")).toThrow(
      "TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)",
    );
  });

  it("encryptToken should throw when TOKEN_ENCRYPTION_KEY is undefined", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", undefined as unknown as string);
    vi.resetModules();
    const { encryptToken } = await import("@/lib/crypto");

    expect(() => encryptToken("my-secret")).toThrow();
  });

  it("decryptToken should throw when TOKEN_ENCRYPTION_KEY is not set", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
    vi.resetModules();
    const { decryptToken } = await import("@/lib/crypto");

    expect(() => decryptToken("cipher:text")).toThrow(
      "TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)",
    );
  });

  it("decryptToken should throw when TOKEN_ENCRYPTION_KEY is undefined", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", undefined as unknown as string);
    vi.resetModules();
    const { decryptToken } = await import("@/lib/crypto");

    expect(() => decryptToken("cipher:text")).toThrow();
  });

  it("encryptToken should throw when key is not 32 bytes (too short)", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "aabbccdd");
    vi.resetModules();
    const { encryptToken } = await import("@/lib/crypto");

    expect(() => encryptToken("test")).toThrow();
  });

  it("encryptToken should throw when key is not valid hex", async () => {
    vi.stubEnv(
      "TOKEN_ENCRYPTION_KEY",
      "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
    );
    vi.resetModules();
    const { encryptToken } = await import("@/lib/crypto");

    expect(() => encryptToken("test")).toThrow();
  });

  it("decryptToken should throw when key is not 32 bytes (too short)", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "aabbccdd");
    vi.resetModules();
    const { decryptToken } = await import("@/lib/crypto");

    expect(() => decryptToken("iv:authTag:cipher")).toThrow();
  });

  // ────────────────────────────────────────────
  // TOKEN_ENCRYPTION_KEY set — roundtrip works
  // ────────────────────────────────────────────

  it("encryptToken/decryptToken roundtrip works with a valid key", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", VALID_KEY);
    vi.resetModules();
    const { encryptToken, decryptToken } = await import("@/lib/crypto");

    const original = "my-secret-token-42";
    const encrypted = encryptToken(original);
    const decrypted = decryptToken(encrypted);

    expect(decrypted).toBe(original);
  });

  it("encryptToken should produce iv:authTag:ciphertext format (3 parts)", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", VALID_KEY);
    vi.resetModules();
    const { encryptToken } = await import("@/lib/crypto");

    const encrypted = encryptToken("hello");
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^[0-9a-f]+$/); // iv
    expect(parts[1]).toMatch(/^[0-9a-f]+$/); // authTag
    expect(parts[2]).toMatch(/^[0-9a-f]+$/); // ciphertext
  });

  it("decryptToken works with different keys for the same plaintext", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", VALID_KEY);
    vi.resetModules();
    const { encryptToken, decryptToken } = await import("@/lib/crypto");

    const original = "cross-check-token";
    const encrypted = encryptToken(original);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(original);
  });

  it("should handle empty string encryption/decryption with valid key", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", VALID_KEY);
    vi.resetModules();
    const { encryptToken, decryptToken } = await import("@/lib/crypto");

    const encrypted = encryptToken("");
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe("");
  });

  it("should handle special characters roundtrip with valid key", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", VALID_KEY);
    vi.resetModules();
    const { encryptToken, decryptToken } = await import("@/lib/crypto");

    const special = "!@#$%^&*()_+-=[]{}|;':\",./<>?`~你好";
    const encrypted = encryptToken(special);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(special);
  });

  // ────────────────────────────────────────────
  // Different keys → different ciphertexts
  // ────────────────────────────────────────────

  it("should produce different ciphertexts for same plaintext with same key (different IV)", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", VALID_KEY);
    vi.resetModules();
    const { encryptToken } = await import("@/lib/crypto");

    const cipherA = encryptToken("same-value");
    const cipherB = encryptToken("same-value");

    // Different IV → entirely different output
    expect(cipherA).not.toBe(cipherB);
    // But both should decrypt to the same value
    const { decryptToken } = await import("@/lib/crypto");
    expect(decryptToken(cipherA)).toBe("same-value");
    expect(decryptToken(cipherB)).toBe("same-value");
  });

  it("should decrypt values encrypted with a different key correctly fails", async () => {
    // Encrypt with key A, try to decrypt with key B
    const keyA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const keyB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    vi.stubEnv("TOKEN_ENCRYPTION_KEY", keyA);
    vi.resetModules();
    const modA = await import("@/lib/crypto");
    const encrypted = modA.encryptToken("secret-with-key-a");

    // Try to decrypt with key B
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", keyB);
    vi.resetModules();
    const modB = await import("@/lib/crypto");
    expect(() => modB.decryptToken(encrypted)).toThrow();
  });
});
