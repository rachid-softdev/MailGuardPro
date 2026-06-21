import { afterEach, describe, expect, it, vi } from "vitest";
import { validateCsrfOrigin } from "@/lib/csrf";

describe("validateCsrfOrigin", () => {
  it("rejects requests without Origin and Referer", () => {
    const req = new Request("http://localhost:3000/api/v1/test", { method: "POST" });
    const result = validateCsrfOrigin(req);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing Origin");
  });

  it("allows requests with X-API-Key even without Origin", () => {
    const req = new Request("http://localhost:3000/api/v1/test", {
      method: "POST",
      headers: { "X-API-Key": "test-key" },
    });
    expect(validateCsrfOrigin(req).valid).toBe(true);
  });

  it("rejects requests with wrong origin", () => {
    const req = new Request("http://localhost:3000/api/v1/test", {
      method: "POST",
      headers: { origin: "https://evil.com" },
    });
    expect(validateCsrfOrigin(req).valid).toBe(false);
  });

  it("allows requests with matching origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    const req = new Request("http://localhost:3000/api/v1/test", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    expect(validateCsrfOrigin(req).valid).toBe(true);
  });

  it("skips CSRF check for paths in skipPaths option", () => {
    const req = new Request("http://localhost:3000/api/stripe/webhook", { method: "POST" });
    const result = validateCsrfOrigin(req, { skipPaths: ["/api/stripe/webhook"] });
    expect(result.valid).toBe(true);
  });

  it("skipPaths correctly handles paths with trailing content", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    // skipPaths with a prefix should match sub-paths
    const req = new Request("http://localhost:3000/api/stripe/webhook/some-extra", {
      method: "POST",
      headers: { origin: "http://evil.com" },
    });
    const result = validateCsrfOrigin(req, { skipPaths: ["/api/stripe/webhook"] });
    expect(result.valid).toBe(true);
  });

  it("skipPaths does NOT skip for non-matching paths", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    const req = new Request("http://localhost:3000/api/v1/validate", {
      method: "POST",
      headers: { origin: "http://evil.com" },
    });
    const result = validateCsrfOrigin(req, { skipPaths: ["/api/stripe/webhook"] });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Origin not allowed");
  });

  it("rejects request with invalid URL in Origin header", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    const req = new Request("http://localhost:3000/api/v1/test", {
      method: "POST",
      headers: { origin: "not a valid url" },
    });
    const result = validateCsrfOrigin(req);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Origin not allowed");
  });

  it("rejects request with empty string Origin (treated as missing)", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    const req = new Request("http://localhost:3000/api/v1/test", {
      method: "POST",
      headers: { origin: "" },
    });
    const result = validateCsrfOrigin(req);
    expect(result.valid).toBe(false);
    // Empty string is falsy, behaves same as missing header
    expect(result.error).toContain("Missing Origin and Referer");
  });

  it("rejects request with empty string Referer when no Origin (both treated as missing)", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    const req = new Request("http://localhost:3000/api/v1/test", {
      method: "POST",
      headers: { referer: "" },
    });
    const result = validateCsrfOrigin(req);
    expect(result.valid).toBe(false);
    // Empty string is falsy, behaves same as missing header
    expect(result.error).toContain("Missing Origin and Referer");
  });

  it("fallback to Referer when Origin is not present", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    const req = new Request("http://localhost:3000/api/v1/test", {
      method: "POST",
      headers: { referer: "http://localhost:3000/some-page" },
    });
    const result = validateCsrfOrigin(req);
    expect(result.valid).toBe(true);
  });

  it("rejects request with Referer from wrong origin when no Origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    const req = new Request("http://localhost:3000/api/v1/test", {
      method: "POST",
      headers: { referer: "http://evil.com/some-page" },
    });
    const result = validateCsrfOrigin(req);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Referer not allowed");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns valid when origin matches app origin in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.APP_ORIGIN = "https://app.mailguardpro.com";
    const req = new Request("https://app.mailguardpro.com/api/v1/validate", {
      headers: { origin: "https://app.mailguardpro.com" },
    });
    const result = validateCsrfOrigin(req);
    expect(result.valid).toBe(true);
    delete process.env.APP_ORIGIN;
  });

  it("returns invalid when origin does not match in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.APP_ORIGIN = "https://app.mailguardpro.com";
    const req = new Request("https://app.mailguardpro.com/api/v1/validate", {
      headers: { origin: "https://evil.com" },
    });
    const result = validateCsrfOrigin(req);
    expect(result.valid).toBe(false);
    delete process.env.APP_ORIGIN;
  });

  it("allows any localhost origin in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.APP_ORIGIN = "https://app.mailguardpro.com";
    const req = new Request("http://localhost:3000/api/v1/validate", {
      headers: { origin: "http://localhost:3000" },
    });
    const result = validateCsrfOrigin(req);
    expect(result.valid).toBe(true);
    delete process.env.APP_ORIGIN;
  });

  it("allows localhost:3001 in development (different port)", () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.APP_ORIGIN = "https://app.mailguardpro.com";
    const req = new Request("http://localhost:3000/api/v1/validate", {
      headers: { origin: "http://localhost:3001" },
    });
    const result = validateCsrfOrigin(req);
    expect(result.valid).toBe(true);
    delete process.env.APP_ORIGIN;
  });

  it("allows 127.0.0.1 in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const req = new Request("http://127.0.0.1:3000/api/v1/validate", {
      headers: { origin: "http://127.0.0.1:3000" },
    });
    const result = validateCsrfOrigin(req);
    expect(result.valid).toBe(true);
  });

  // ────────────────────────────────────────────
  // Scenario (a): isLocalhostOrigin avec URL invalide → catch → retourne false
  // ────────────────────────────────────────────
  it("handles invalid origin URLs via isValidOrigin catch in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    // An invalid URL in origin — new URL() throws inside isValidOrigin,
    // caught by the catch on line 68, returns false
    const req = new Request("http://localhost:3000/api/v1/test", {
      method: "POST",
      headers: { origin: ":::" },
    });
    const result = validateCsrfOrigin(req);
    expect(result.valid).toBe(false);
  });

  // ────────────────────────────────────────────
  // Scenario (b): getAppOrigin — APP_ORIGIN prioritaire sur NEXT_PUBLIC_APP_URL
  // ────────────────────────────────────────────
  it("should use APP_ORIGIN when both APP_ORIGIN and NEXT_PUBLIC_APP_URL are set", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.APP_ORIGIN = "https://custom.app.com";
    process.env.NEXT_PUBLIC_APP_URL = "http://fallback.app.com";

    // origin matching APP_ORIGIN should succeed
    const req1 = new Request("https://custom.app.com/api/v1/test", {
      headers: { origin: "https://custom.app.com" },
    });
    expect(validateCsrfOrigin(req1).valid).toBe(true);

    // origin matching NEXT_PUBLIC_APP_URL should fail (APP_ORIGIN takes priority)
    const req2 = new Request("https://custom.app.com/api/v1/test", {
      headers: { origin: "http://fallback.app.com" },
    });
    expect(validateCsrfOrigin(req2).valid).toBe(false);
  });

  it("should fall back to NEXT_PUBLIC_APP_URL when APP_ORIGIN is not set", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.APP_ORIGIN;
    process.env.NEXT_PUBLIC_APP_URL = "https://fallback.app.com";

    const req = new Request("https://fallback.app.com/api/v1/test", {
      headers: { origin: "https://fallback.app.com" },
    });
    expect(validateCsrfOrigin(req).valid).toBe(true);
  });

  // ────────────────────────────────────────────
  // Scenario (c): skipPaths avec URL malformée → catch silencieux
  // ────────────────────────────────────────────
  it("skipPaths should catch malformed URL and continue validation", () => {
    // Pass a request-like object with an invalid URL that causes new URL() to throw
    const req = {
      url: "not-a-valid-url",
      headers: new Headers(),
    } as unknown as Request;

    // Should not throw — the catch in skipPaths silently ignores the error
    const result = validateCsrfOrigin(req, { skipPaths: ["/api/stripe/webhook"] });
    // Without a valid origin/referer, it should return invalid
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing Origin");
  });

  it("skipPaths malformed URL with valid Origin header continues normally", () => {
    // Even with malformed URL in skipPaths, valid origin should still be checked
    const req = {
      url: "not-a-valid-url",
      headers: new Headers({ origin: "http://localhost:3000" }),
    } as unknown as Request;

    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    const result = validateCsrfOrigin(req, { skipPaths: ["/api/stripe/webhook"] });
    expect(result.valid).toBe(true);
  });

  // ────────────────────────────────────────────
  // Unreachable lines: 18 and 86
  //
  // Line 18 (isLocalhostOrigin catch at csrf.ts:17-19):
  //   isLocalhostOrigin() is called from isValidOrigin() with the same `value`
  //   that already passed `new URL()` on line 57. Since `new URL()` is
  //   deterministic, if it succeeds in isValidOrigin it will also succeed in
  //   isLocalhostOrigin. The catch block on line 18 is therefore unreachable.
  //
  // Line 86 (return { valid: true } at csrf.ts:86):
  //   All possible code paths before line 86 return explicitly:
  //     - skipPaths match → return on line 31
  //     - X-API-Key header → return on line 40
  //     - Both origin AND referer missing → return on line 48
  //     - origin present → return on line 74 or 76
  //     - referer present → return on line 81 or 83
  //   To reach line 86, we'd need origin OR referer to be truthy (to pass
  //   the `!origin && !referer` gate on line 46) while BOTH `if (origin)` and
  //   `if (referer)` are false — which is logically impossible in JS.
  //
  //   Conclusion: both lines are unreachable dead code that could be removed
  //   in a cleanup pass, but are kept as defensive safety nets.
  // ────────────────────────────────────────────
});
