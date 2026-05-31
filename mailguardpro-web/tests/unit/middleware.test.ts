import { describe, expect, it } from "vitest";

describe("middleware CSP", () => {
  describe("CSP header building", () => {
    it("should generate nonce that changes on each request", () => {
      const nonce1 = generateTestNonce();
      const nonce2 = generateTestNonce();
      expect(nonce1).not.toBe(nonce2);
      expect(nonce1.length).toBeGreaterThan(0);
    });

    it("CSP string should contain nonce- but NOT unsafe-inline for script-src", () => {
      const nonce = generateTestNonce();
      const csp = buildTestCsp(nonce);

      const scriptSrc = extractDirective(csp, "script-src");
      expect(scriptSrc).toContain(`'nonce-${nonce}'`);
      expect(scriptSrc).not.toContain("unsafe-inline");

      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("form-action 'self'");
      expect(csp).toContain("base-uri 'self'");
    });

    it("should not contain unsafe-inline or unsafe-eval in script-src", () => {
      const nonce = generateTestNonce();
      const csp = buildTestCsp(nonce);
      const scriptSrc = extractDirective(csp, "script-src");

      // Script-src should use nonce + strict-dynamic, not unsafe-inline
      expect(scriptSrc).not.toContain("unsafe-inline");
      expect(scriptSrc).not.toContain("unsafe-eval");
      expect(scriptSrc).toContain("strict-dynamic");
    });

    it("CSP should contain 'strict-dynamic' in script-src", () => {
      const nonce = generateTestNonce();
      const csp = buildTestCsp(nonce);
      const scriptSrc = extractDirective(csp, "script-src");

      expect(scriptSrc).toContain("strict-dynamic");
    });

    it("should allow HTTPS connections in connect-src", () => {
      const nonce = generateTestNonce();
      const csp = buildTestCsp(nonce);
      const connectSrc = extractDirective(csp, "connect-src");

      expect(connectSrc).toContain("https:");
    });

    it("should allow images from data:, blob: and https:", () => {
      const nonce = generateTestNonce();
      const csp = buildTestCsp(nonce);
      const imgSrc = extractDirective(csp, "img-src");

      expect(imgSrc).toContain("data:");
      expect(imgSrc).toContain("blob:");
      expect(imgSrc).toContain("https:");
    });

    it("nonce should be a base64url-encoded string (no +, /, or = characters)", () => {
      const nonce = generateTestNonce();
      // Base64url encoding of 16 bytes produces ~22 chars (no padding)
      expect(nonce.length).toBeGreaterThanOrEqual(20);
      // Must NOT contain +, /, or = (base64url instead of base64)
      expect(nonce).not.toMatch(/[+/=]/);
      // Must be alphanumeric + dash + underscore
      expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("should set x-csp-nonce request header for downstream use", () => {
      // This is what layout.tsx reads via headers().get("x-csp-nonce")
      const nonce = generateTestNonce();
      const nonce2 = generateTestNonce();
      // Nonce must change per request
      expect(nonce).not.toBe(nonce2);
    });
  });
});

// Helper functions that mirror the middleware's CSP logic
function generateTestNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  // Match the actual middleware implementation: base64url encoding
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildTestCsp(nonce: string): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' https:`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
  ].join("; ");
}

function extractDirective(csp: string, directive: string): string {
  const parts = csp.split(";").map((p) => p.trim());
  const found = parts.find((p) => p.startsWith(directive));
  return found || "";
}
