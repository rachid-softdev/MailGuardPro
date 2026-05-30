import { validateCsrfOrigin } from "@/lib/csrf";
import { describe, expect, it } from "vitest";

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

  it("returns valid when origin matches app origin in production", () => {
    process.env.NODE_ENV = "production";
    process.env.APP_ORIGIN = "https://app.mailguardpro.com";
    const req = new Request("https://app.mailguardpro.com/api/v1/validate", {
      headers: { origin: "https://app.mailguardpro.com" },
    });
    const result = validateCsrfOrigin(req);
    expect(result.valid).toBe(true);
    delete process.env.APP_ORIGIN;
  });

  it("returns invalid when origin does not match in production", () => {
    process.env.NODE_ENV = "production";
    process.env.APP_ORIGIN = "https://app.mailguardpro.com";
    const req = new Request("https://app.mailguardpro.com/api/v1/validate", {
      headers: { origin: "https://evil.com" },
    });
    const result = validateCsrfOrigin(req);
    expect(result.valid).toBe(false);
    delete process.env.APP_ORIGIN;
  });

  it("allows any localhost origin in development", () => {
    process.env.NODE_ENV = "development";
    process.env.APP_ORIGIN = "https://app.mailguardpro.com";
    const req = new Request("http://localhost:3000/api/v1/validate", {
      headers: { origin: "http://localhost:3000" },
    });
    const result = validateCsrfOrigin(req);
    expect(result.valid).toBe(true);
    delete process.env.APP_ORIGIN;
  });

  it("allows localhost:3001 in development (different port)", () => {
    process.env.NODE_ENV = "development";
    process.env.APP_ORIGIN = "https://app.mailguardpro.com";
    const req = new Request("http://localhost:3000/api/v1/validate", {
      headers: { origin: "http://localhost:3001" },
    });
    const result = validateCsrfOrigin(req);
    expect(result.valid).toBe(true);
    delete process.env.APP_ORIGIN;
  });

  it("allows 127.0.0.1 in development", () => {
    process.env.NODE_ENV = "development";
    const req = new Request("http://127.0.0.1:3000/api/v1/validate", {
      headers: { origin: "http://127.0.0.1:3000" },
    });
    const result = validateCsrfOrigin(req);
    expect(result.valid).toBe(true);
  });
});
