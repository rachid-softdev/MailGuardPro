/**
 * Additional unit tests for lib/csrf.ts (validateCsrfOrigin)
 * - Production must NOT allow localhost origins (dev-only bypass)
 * - Origin takes precedence over Referer when both are present
 * - Referer may be a full URL (with path); only its origin is compared
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateCsrfOrigin } from "@/lib/csrf";

describe("validateCsrfOrigin — extra coverage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.APP_ORIGIN;
  });

  it("rejects a localhost origin in production (dev bypass must not apply)", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.APP_ORIGIN = "https://app.mailguardpro.com";
    const req = new Request("https://app.mailguardpro.com/api/v1/test", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    const result = validateCsrfOrigin(req);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Origin not allowed");
  });

  it("rejects request when Origin is wrong even if Referer is correct (origin precedence)", () => {
    process.env.APP_ORIGIN = "http://localhost:3000";
    const req = new Request("http://localhost:3000/api/v1/test", {
      method: "POST",
      headers: {
        origin: "https://evil.com",
        referer: "http://localhost:3000/some-page",
      },
    });
    const result = validateCsrfOrigin(req);
    // Origin is present and wrong → rejected, Referer is ignored
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Origin not allowed");
  });

  it("accepts a Referer that is a full URL (with path) when no Origin is present", () => {
    process.env.APP_ORIGIN = "http://localhost:3000";
    const req = new Request("http://localhost:3000/api/v1/test", {
      method: "POST",
      headers: { referer: "http://localhost:3000/dashboard/settings?x=1" },
    });
    const result = validateCsrfOrigin(req);
    expect(result.valid).toBe(true);
  });

  it("rejects a Referer whose origin mismatches even with a valid-looking path", () => {
    process.env.APP_ORIGIN = "http://localhost:3000";
    const req = new Request("http://localhost:3000/api/v1/test", {
      method: "POST",
      headers: { referer: "https://evil.com/localhost:3000/foo" },
    });
    const result = validateCsrfOrigin(req);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Referer not allowed");
  });
});
