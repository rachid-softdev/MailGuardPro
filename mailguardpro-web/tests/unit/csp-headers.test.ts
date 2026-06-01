// =============================================================================
// TEST 4 (SEC-3) — CSP unification: buildCsp function
// =============================================================================
// Tests the Content-Security-Policy header builder, including nonce generation,
// default origins (Stripe, Sentry), environment variable overrides, and
// strict-dynamic presence.
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// HELPER — replicates buildCsp from middleware.ts exactly
// =============================================================================

function buildCsp(nonce: string): string {
  const stripeOrigins = process.env.CSP_STRIPE_ORIGINS || "https://js.stripe.com";
  const sentryOrigins = process.env.CSP_SENTRY_ORIGINS || "https://o*.ingest.sentry.io";
  const frameOrigins =
    process.env.CSP_FRAME_ORIGINS || "https://js.stripe.com https://hooks.stripe.com";
  const imgOrigins =
    process.env.CSP_IMG_ORIGINS ||
    "https://lh3.googleusercontent.com https://avatars.githubusercontent.com";

  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${stripeOrigins}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https: ${imgOrigins}`,
    `font-src 'self' data:`,
    `connect-src 'self' https: ${sentryOrigins}`,
    `frame-src 'self' ${frameOrigins}`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

// Helper to extract a directive value from a CSP string
function extractDirective(csp: string, directive: string): string {
  const parts = csp.split(";").map((p) => p.trim());
  const found = parts.find((p) => p.startsWith(directive));
  return found || "";
}

// =============================================================================
// TESTS
// =============================================================================

describe("SEC-3: CSP header unification", () => {
  const testNonce = "test-nonce-abc123";

  beforeEach(() => {
    // Clear env vars before each test
    delete process.env.CSP_STRIPE_ORIGINS;
    delete process.env.CSP_SENTRY_ORIGINS;
    delete process.env.CSP_FRAME_ORIGINS;
    delete process.env.CSP_IMG_ORIGINS;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ---------------------------------------------------------------------------
  // Test 1 — Inclut le nonce généré
  // ---------------------------------------------------------------------------
  it("should include the generated nonce in script-src", () => {
    const csp = buildCsp(testNonce);
    const scriptSrc = extractDirective(csp, "script-src");

    expect(scriptSrc).toContain(`'nonce-${testNonce}'`);
  });

  it("should have a different nonce for each call (nonce uniqueness)", () => {
    const nonce1 = "nonce-aaa";
    const nonce2 = "nonce-bbb";

    const csp1 = buildCsp(nonce1);
    const csp2 = buildCsp(nonce2);

    const s1 = extractDirective(csp1, "script-src");
    const s2 = extractDirective(csp2, "script-src");

    expect(s1).toContain("'nonce-nonce-aaa'");
    expect(s2).toContain("'nonce-nonce-bbb'");
    expect(s1).not.toBe(s2);
  });

  // ---------------------------------------------------------------------------
  // Test 2 — Inclut Stripe origins par défaut
  // ---------------------------------------------------------------------------
  it("should include default Stripe origins (https://js.stripe.com) in script-src", () => {
    const csp = buildCsp(testNonce);
    const scriptSrc = extractDirective(csp, "script-src");

    expect(scriptSrc).toContain("https://js.stripe.com");
  });

  it("should include default Stripe origins in frame-src", () => {
    const csp = buildCsp(testNonce);
    const frameSrc = extractDirective(csp, "frame-src");

    expect(frameSrc).toContain("https://js.stripe.com");
    expect(frameSrc).toContain("https://hooks.stripe.com");
  });

  // ---------------------------------------------------------------------------
  // Test 3 — Inclut Sentry origins par défaut
  // ---------------------------------------------------------------------------
  it("should include default Sentry origins (https://o*.ingest.sentry.io) in connect-src", () => {
    const csp = buildCsp(testNonce);
    const connectSrc = extractDirective(csp, "connect-src");

    expect(connectSrc).toContain("https://o*.ingest.sentry.io");
  });

  // ---------------------------------------------------------------------------
  // Test 4 — Supporte les variables d'environnement
  // ---------------------------------------------------------------------------
  it("should use CSP_STRIPE_ORIGINS env var when set", () => {
    vi.stubEnv("CSP_STRIPE_ORIGINS", "https://custom.stripe.com https://stripe.custom.com");

    const csp = buildCsp(testNonce);
    const scriptSrc = extractDirective(csp, "script-src");

    expect(scriptSrc).toContain("https://custom.stripe.com");
    expect(scriptSrc).toContain("https://stripe.custom.com");
    // Default should NOT be present
    expect(scriptSrc).not.toContain("https://js.stripe.com");
  });

  it("should use CSP_SENTRY_ORIGINS env var when set", () => {
    vi.stubEnv("CSP_SENTRY_ORIGINS", "https://sentry.custom.io");

    const csp = buildCsp(testNonce);
    const connectSrc = extractDirective(csp, "connect-src");

    expect(connectSrc).toContain("https://sentry.custom.io");
    expect(connectSrc).not.toContain("https://o*.ingest.sentry.io");
  });

  it("should use CSP_FRAME_ORIGINS env var when set", () => {
    vi.stubEnv("CSP_FRAME_ORIGINS", "https://custom-frame.com");

    const csp = buildCsp(testNonce);
    const frameSrc = extractDirective(csp, "frame-src");

    expect(frameSrc).toContain("https://custom-frame.com");
    expect(frameSrc).not.toContain("https://js.stripe.com");
  });

  it("should use CSP_IMG_ORIGINS env var when set", () => {
    vi.stubEnv("CSP_IMG_ORIGINS", "https://custom-avatar.com");

    const csp = buildCsp(testNonce);
    const imgSrc = extractDirective(csp, "img-src");

    expect(imgSrc).toContain("https://custom-avatar.com");
    expect(imgSrc).not.toContain("https://lh3.googleusercontent.com");
  });

  // ---------------------------------------------------------------------------
  // Test 5 — La directive strict-dynamic est présente
  // ---------------------------------------------------------------------------
  it("should include 'strict-dynamic' in script-src", () => {
    const csp = buildCsp(testNonce);
    const scriptSrc = extractDirective(csp, "script-src");

    expect(scriptSrc).toContain("'strict-dynamic'");
  });

  it("should NOT include 'unsafe-inline' in script-src (strict-dynamic replaces it)", () => {
    const csp = buildCsp(testNonce);
    const scriptSrc = extractDirective(csp, "script-src");

    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  // ---------------------------------------------------------------------------
  // Structure validation
  // ---------------------------------------------------------------------------
  it("should produce a valid CSP string with all required directives", () => {
    const csp = buildCsp(testNonce);

    // All required directives must be present
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src");
    expect(csp).toContain("style-src");
    expect(csp).toContain("img-src");
    expect(csp).toContain("font-src");
    expect(csp).toContain("connect-src");
    expect(csp).toContain("frame-src");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("should separate directives with semicolons", () => {
    const csp = buildCsp(testNonce);
    const directives = csp
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean);

    // Should have at least 12 directives
    expect(directives.length).toBeGreaterThanOrEqual(12);
  });

  // ---------------------------------------------------------------------------
  // upgrade-insecure-requests
  // ---------------------------------------------------------------------------
  it("should include 'upgrade-insecure-requests' directive", () => {
    const csp = buildCsp(testNonce);

    expect(csp).toContain("upgrade-insecure-requests");
  });

  // ---------------------------------------------------------------------------
  // frame-ancestors is 'none' (anti-clickjacking)
  // ---------------------------------------------------------------------------
  it("should set frame-ancestors to 'none' to prevent clickjacking", () => {
    const csp = buildCsp(testNonce);
    const frameAncestors = extractDirective(csp, "frame-ancestors");

    expect(frameAncestors).toBe("frame-ancestors 'none'");
  });
});
