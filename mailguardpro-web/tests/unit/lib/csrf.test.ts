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
    expect(result.error).toContain("Invalid Origin");
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
});
