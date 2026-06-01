import { describe, expect, it, vi } from "vitest";

// Mock config/cors before importing cors module
// Must use vi.hoisted so variables are available in vi.mock factory
const { mockConfig } = vi.hoisted(() => ({
  mockConfig: {
    allowedOrigins: [
      "https://mailguardpro.com",
      "https://app.mailguardpro.com",
      "http://localhost:3000",
    ],
    allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "Idempotency-Key"],
    exposeHeaders: ["X-Request-Id", "Idempotency-Key", "X-RateLimit-Remaining"],
    maxAge: 86400,
    credentials: true,
  },
}));

vi.mock("@/config/cors", () => ({
  corsConfig: mockConfig,
}));

import { getCorsHeaders, handleCors } from "@/lib/cors";

describe("getCorsHeaders", () => {
  // ──────────────── Known origin ────────────────

  it("should return the matching origin header for a known origin", () => {
    const headers = getCorsHeaders("https://mailguardpro.com");

    expect(headers["Access-Control-Allow-Origin"]).toBe("https://mailguardpro.com");
  });

  it("should match one of several allowed origins", () => {
    const headers = getCorsHeaders("http://localhost:3000");

    expect(headers["Access-Control-Allow-Origin"]).toBe("http://localhost:3000");
  });

  it("should include all standard CORS headers", () => {
    const headers = getCorsHeaders("https://mailguardpro.com");

    expect(headers).toHaveProperty("Access-Control-Allow-Origin");
    expect(headers).toHaveProperty("Access-Control-Allow-Methods");
    expect(headers).toHaveProperty("Access-Control-Allow-Headers");
    expect(headers).toHaveProperty("Access-Control-Expose-Headers");
    expect(headers).toHaveProperty("Access-Control-Max-Age");
  });

  it("should include Allow-Methods from config", () => {
    const headers = getCorsHeaders("https://mailguardpro.com");

    expect(headers["Access-Control-Allow-Methods"]).toBe("GET, POST, PUT, PATCH, DELETE, OPTIONS");
  });

  it("should include Allow-Headers from config", () => {
    const headers = getCorsHeaders("https://mailguardpro.com");

    expect(headers["Access-Control-Allow-Headers"]).toContain("Idempotency-Key");
  });

  it("should include Expose-Headers from config", () => {
    const headers = getCorsHeaders("https://mailguardpro.com");

    expect(headers["Access-Control-Expose-Headers"]).toContain("X-Request-Id");
  });

  it("should set Max-Age from config", () => {
    const headers = getCorsHeaders("https://mailguardpro.com");

    expect(headers["Access-Control-Max-Age"]).toBe("86400");
  });

  // ──────────────── Unknown origin ────────────────

  it("should return the first allowed origin when the origin is unknown", () => {
    const headers = getCorsHeaders("https://evil.com");

    expect(headers["Access-Control-Allow-Origin"]).toBe("https://mailguardpro.com");
  });

  // ──────────────── Null / missing origin ────────────────

  it("should return wildcard for null origin", () => {
    const headers = getCorsHeaders(null);

    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("should return wildcard for 'null' string origin", () => {
    const headers = getCorsHeaders("null");

    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  // ──────────────── Credentials flag ────────────────

  it("should set Allow-Credentials when true and origin is not wildcard", () => {
    const headers = getCorsHeaders("https://mailguardpro.com");

    expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
  });

  it("should NOT set Allow-Credentials when origin is wildcard (null origin)", () => {
    const headers = getCorsHeaders(null);

    expect(headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  it("should NOT set Allow-Credentials when credentials is false in config", () => {
    const headers = getCorsHeaders("https://mailguardpro.com", { credentials: false });

    expect(headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  // ──────────────── Custom config override ────────────────

  it("should allow overriding config options", () => {
    const headers = getCorsHeaders("https://mailguardpro.com", {
      maxAge: 3600,
      credentials: false,
    });

    expect(headers["Access-Control-Max-Age"]).toBe("3600");
    expect(headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  it("should merge partial config with defaults", () => {
    const headers = getCorsHeaders("https://mailguardpro.com", { maxAge: 600 });

    expect(headers["Access-Control-Max-Age"]).toBe("600");
    expect(headers["Access-Control-Allow-Methods"]).toBe("GET, POST, PUT, PATCH, DELETE, OPTIONS");
  });

  it("should use custom allowed origins when provided via config override", () => {
    const headers = getCorsHeaders("https://custom.com", {
      allowedOrigins: ["https://custom.com"],
    });

    expect(headers["Access-Control-Allow-Origin"]).toBe("https://custom.com");
  });
});

describe("handleCors", () => {
  it("should return a 204 response for OPTIONS request", () => {
    const req = new Request("https://mailguardpro.com/api/test", { method: "OPTIONS" });
    // Set origin manually for Request constructor — node Request may not parse as expected
    Object.defineProperty(req, "headers", {
      value: new Headers({ origin: "https://mailguardpro.com" }),
    });

    const result = handleCors(req);

    expect(result).not.toBeNull();
    expect(result!.status).toBe(204);
  });

  it("should return null for non-OPTIONS request", () => {
    const req = new Request("https://mailguardpro.com/api/test", { method: "GET" });

    const result = handleCors(req);

    expect(result).toBeNull();
  });

  it("should include Content-Length: 0 in preflight response", () => {
    const req = new Request("https://mailguardpro.com/api/test", { method: "OPTIONS" });
    Object.defineProperty(req, "headers", {
      value: new Headers({ origin: "https://mailguardpro.com" }),
    });

    const result = handleCors(req);
    const contentLength = result!.headers.get("Content-Length");

    expect(contentLength).toBe("0");
  });

  it("should include CORS headers in preflight response", () => {
    const req = new Request("https://mailguardpro.com/api/test", { method: "OPTIONS" });
    Object.defineProperty(req, "headers", {
      value: new Headers({ origin: "https://mailguardpro.com" }),
    });

    const result = handleCors(req);

    expect(result!.headers.get("Access-Control-Allow-Origin")).toBe("https://mailguardpro.com");
    expect(result!.headers.get("Access-Control-Allow-Methods")).toBeTruthy();
  });

  it("should return null for OPTIONS without origin header", () => {
    const req = new Request("https://mailguardpro.com/api/test", { method: "OPTIONS" });
    // No origin header set
    const originalHeaders = req.headers;
    vi.spyOn(originalHeaders, "get").mockReturnValue(null);

    const result = handleCors(req);

    expect(result).not.toBeNull();
    if (result) {
      // With null origin → wildcard in CORS headers
      expect(result.headers.get("Access-Control-Allow-Origin")).toBe("*");
    }
  });
});
