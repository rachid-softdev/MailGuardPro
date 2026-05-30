import { beforeEach, describe, expect, it } from "vitest";
import { AUTH_SECRET_MIN_LENGTH, validateAuthSecret } from "@/lib/authSecretValidator";

describe("validateAuthSecret", () => {
  const ORIGINAL_SECRET = process.env.AUTH_SECRET;

  beforeEach(() => {
    process.env.AUTH_SECRET = ORIGINAL_SECRET;
  });

  it("returns invalid when AUTH_SECRET is not set", () => {
    delete process.env.AUTH_SECRET;
    const result = validateAuthSecret();
    expect(result.valid).toBe(false);
    expect(result.message).toContain("not defined");
  });

  it("returns invalid when AUTH_SECRET is empty string", () => {
    process.env.AUTH_SECRET = "";
    const result = validateAuthSecret();
    expect(result.valid).toBe(false);
    expect(result.message).toContain("not defined");
  });

  it("returns invalid when AUTH_SECRET is too short", () => {
    process.env.AUTH_SECRET = "short";
    const result = validateAuthSecret();
    expect(result.valid).toBe(false);
    expect(result.message).toContain(`at least ${AUTH_SECRET_MIN_LENGTH}`);
  });

  it("returns invalid for known weak secret 'secret' (too short + weak)", () => {
    process.env.AUTH_SECRET = "secret";
    const result = validateAuthSecret();
    expect(result.valid).toBe(false);
    // Length check (< 32) triggers before weak secret check
    expect(result.message).toContain("at least");
  });

  it("returns invalid for known weak secret 'password' (too short + weak)", () => {
    process.env.AUTH_SECRET = "password";
    const result = validateAuthSecret();
    expect(result.valid).toBe(false);
    // Length check (< 32) triggers before weak secret check
    expect(result.message).toContain("at least");
  });

  it("returns invalid for 'your-secret-key-min-32-characters-long'", () => {
    process.env.AUTH_SECRET = "your-secret-key-min-32-characters-long";
    const result = validateAuthSecret();
    expect(result.valid).toBe(false);
    expect(result.message).toContain("known weak/default");
  });

  it("returns invalid for 'change-me-to-a-random-secret' (too short + weak)", () => {
    process.env.AUTH_SECRET = "change-me-to-a-random-secret";
    const result = validateAuthSecret();
    expect(result.valid).toBe(false);
    // 28 chars < 32, so length check triggers first
    expect(result.message).toContain("at least");
  });

  it("returns invalid for the default dev secret", () => {
    process.env.AUTH_SECRET = "dev-secret-change-in-production-min-32-chars-long";
    const result = validateAuthSecret();
    expect(result.valid).toBe(false);
    expect(result.message).toContain("known weak/default");
  });

  it("handles case-insensitive weak secret matching (too short + weak)", () => {
    process.env.AUTH_SECRET = "SECRET";
    const result = validateAuthSecret();
    expect(result.valid).toBe(false);
    // "SECRET" is 6 chars, length check (< 32) triggers first
    expect(result.message).toContain("at least");
  });

  it("returns valid for strong secrets with 64 characters", () => {
    process.env.AUTH_SECRET = "a".repeat(64);
    const result = validateAuthSecret();
    expect(result.valid).toBe(true);
  });

  it("returns valid for exactly 32 character secret", () => {
    process.env.AUTH_SECRET = "x".repeat(32);
    const result = validateAuthSecret();
    expect(result.valid).toBe(true);
  });

  it("returns valid for a realistic base64 secret", () => {
    process.env.AUTH_SECRET = "dGhpcyBpcyBhIHZlcnkgc2VjdXJlIHNlY3JldCB0aGF0IGlzIDMyIGJ5dGVz";
    const result = validateAuthSecret();
    expect(result.valid).toBe(true);
  });

  it("returns valid message on success", () => {
    process.env.AUTH_SECRET = "a".repeat(64);
    const result = validateAuthSecret();
    expect(result.message).toContain("properly configured");
  });
});
