// =============================================================================
// SEC-1: Timing-safe catch block in validate route
// Tests that enforceTimingSafeResponse is called in the catch block,
// that the catch block still returns 500, and that startTime is available.
// =============================================================================

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock setup
// ---------------------------------------------------------------------------

const { mockEnforceTimingSafeResponse } = vi.hoisted(() => ({
  mockEnforceTimingSafeResponse: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/timingSafe", () => ({
  enforceTimingSafeResponse: mockEnforceTimingSafeResponse,
}));

// Mock auth — return a user so we exercise the full path
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() =>
    Promise.resolve({
      user: { id: "test-user", plan: "FREE", credits: 100 },
    }),
  ),
}));

vi.mock("@/lib/auth/require-scope", () => ({
  hasScope: vi.fn(() => true),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(() =>
        Promise.resolve({
          id: "test-user",
          credits: 100,
          plan: "FREE",
          isActive: true,
        }),
      ),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    apiKey: {
      findUnique: vi.fn(() => Promise.resolve(null)),
      update: vi.fn(() => Promise.resolve({})),
    },
    validation: {
      create: vi.fn(() => Promise.resolve({})),
    },
    $transaction: vi.fn(async (cb: any) => {
      return cb({
        user: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn(() => Promise.resolve({ credits: 99 })),
        },
        validation: {
          create: vi.fn(() => Promise.resolve({})),
        },
      });
    }),
  },
}));

vi.mock("@/lib/redis", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ success: true, remaining: 100, resetAt: new Date() }),
  ),
}));

vi.mock("@/lib/rateLimits", () => ({
  checkRateLimitByPlan: vi.fn(() =>
    Promise.resolve({ success: true, remaining: 100, resetAt: new Date(), limit: 20 }),
  ),
}));

vi.mock("@/lib/ssrf", () => ({
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/lib/crypto", () => ({
  hashApiKey: vi.fn(() => "hashed-key"),
  hashApiKeyLegacy: vi.fn(() => "legacy-hashed-key"),
}));

vi.mock("@/lib/emailHash", () => ({
  hashEmail: vi.fn((email) => `hash:${email}`),
  maskEmail: vi.fn((email) => email),
}));

vi.mock("@/services/disposableChecker", () => ({
  checkDisposable: vi.fn(() =>
    Promise.resolve({ passed: true, message: "Not disposable", detail: "" }),
  ),
}));

vi.mock("@/services/emailValidator", () => ({
  validateEmail: vi.fn(() =>
    Promise.resolve({
      email: "test@example.com",
      score: 85,
      status: "valid",
      checks: {},
      processingTimeMs: 100,
    }),
  ),
}));

vi.mock("@/services/formatChecker", () => ({
  checkFormat: vi.fn(() => ({ passed: true, message: "Valid format" })),
}));

// Silence console
vi.spyOn(console, "error").mockImplementation(() => {});

import { GET } from "@/app/api/v1/validate/route";

describe("SEC-1: Timing-safe catch block", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Test: enforceTimingSafeResponse is called in the catch block
  // --------------------------------------------------------------------------

  it("should call enforceTimingSafeResponse in the catch block on error", async () => {
    // Make the route throw an error by causing a DB failure
    // Re-mock prisma.$transaction to throw
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error("DB connection failed in test"));

    const url = new URL("http://localhost:3000/api/v1/validate?email=test@example.com");
    const req = new NextRequest(url);
    const response = await GET(req);

    // Should still return 500
    expect(response.status).toBe(500);

    // enforceTimingSafeResponse should have been called
    expect(mockEnforceTimingSafeResponse).toHaveBeenCalled();
  });

  it("should pass startTime to enforceTimingSafeResponse in catch block", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error("DB connection failed in test"));

    const url = new URL("http://localhost:3000/api/v1/validate?email=test@example.com");
    const req = new NextRequest(url);
    await GET(req);

    // The first argument to enforceTimingSafeResponse should be a number (startTime)
    expect(mockEnforceTimingSafeResponse).toHaveBeenCalledWith(expect.any(Number));
  });

  // --------------------------------------------------------------------------
  // Test: Catch block still returns 500
  // --------------------------------------------------------------------------

  it("should return 500 status from the catch block", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(
      new Error("Internal server error triggered"),
    );

    const url = new URL("http://localhost:3000/api/v1/validate?email=test@example.com");
    const req = new NextRequest(url);
    const response = await GET(req);

    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toBeDefined();
  });

  it("should handle non-Error thrown values gracefully", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.$transaction).mockRejectedValueOnce("string error" as any);

    const url = new URL("http://localhost:3000/api/v1/validate?email=test@example.com");
    const req = new NextRequest(url);
    const response = await GET(req);

    expect(response.status).toBe(500);
    expect(mockEnforceTimingSafeResponse).toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Test: Normal flow does NOT trigger catch-block path
  // --------------------------------------------------------------------------

  it("should NOT crash when anonymous user makes a request (no auth, good email)", async () => {
    // Override auth to return null (anonymous)
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as any);

    mockEnforceTimingSafeResponse.mockClear();

    const url = new URL("http://localhost:3000/api/v1/validate?email=test@example.com");
    const req = new NextRequest(url);
    const response = await GET(req);

    // Anonymous requests should complete without crashing
    expect(response.status).toBe(200);
  });

  it("should call enforceTimingSafeResponse when INSUFFICIENT_CREDITS is thrown", async () => {
    // Reset mock
    mockEnforceTimingSafeResponse.mockClear();

    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (cb: any) => {
      return cb({
        user: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }), // No credits!
          findUnique: vi.fn(() => Promise.resolve({ credits: 0 })),
        },
        validation: {
          create: vi.fn(() => Promise.resolve({})),
        },
      });
    });

    const url = new URL("http://localhost:3000/api/v1/validate?email=test@example.com");
    const req = new NextRequest(url);
    const response = await GET(req);

    // Insufficient credits returns 403, not 500
    expect(response.status).toBe(403);

    // But enforceTimingSafeResponse should still be called in the inner catch
    expect(mockEnforceTimingSafeResponse).toHaveBeenCalledWith(expect.any(Number));
  });

  // --------------------------------------------------------------------------
  // Test: startTime is defined and available
  // --------------------------------------------------------------------------

  it("should have startTime defined as a number at function start", async () => {
    // The route starts with `const startTime = Date.now();`
    // We verify enforceTimingSafeResponse receives a valid timestamp
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error("Forced error"));

    const url = new URL("http://localhost:3000/api/v1/validate?email=test@example.com");
    const req = new NextRequest(url);
    await GET(req);

    expect(mockEnforceTimingSafeResponse).toHaveBeenCalled();
    const startTimeArg = mockEnforceTimingSafeResponse.mock.calls[0][0];
    expect(typeof startTimeArg).toBe("number");
    expect(startTimeArg).toBeGreaterThan(0);
    // Should be close to current time
    expect(startTimeArg).toBeLessThanOrEqual(Date.now());
  });
});
