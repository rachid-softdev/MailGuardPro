import { beforeEach, describe, expect, it, vi } from "vitest";

// Le module crypto.ts throw au chargement si API_KEY_PEPPER est absent
// On doit le stub AVANT tout import

describe("crypto utils", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

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
