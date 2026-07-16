import { NextRequest } from "next/server";
/**
 * Integration tests for GET /api/v1/validate — BUSINESS (unlimited) plan.
 *
 * Regression coverage for the BUSINESS credits-model reconciliation:
 * a BUSINESS user must never be blocked by the `credits >= 1` gate even
 * when their stored credit balance is 0.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockValidateEmail, mockCheckFormat, mockCheckDisposable } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: "user-biz", isActive: true, credits: 0 }),
      updateMany: vi.fn(),
    },
    apiKey: { findFirst: vi.fn().mockResolvedValue(null) },
    validation: { create: vi.fn(), update: vi.fn() },
    session: { findMany: vi.fn().mockResolvedValue([]) },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  mockValidateEmail: vi.fn(),
  mockCheckFormat: vi.fn(),
  mockCheckDisposable: vi.fn(),
}));

vi.mock("@/services/emailValidator", () => ({ validateEmail: mockValidateEmail }));
vi.mock("@/services/formatChecker", () => ({ checkFormat: mockCheckFormat }));
vi.mock("@/services/disposableChecker", () => ({ checkDisposable: mockCheckDisposable }));
vi.mock("@/services/dnsChecker", () => ({ checkMX: vi.fn(), checkSPF: vi.fn(), checkDMARC: vi.fn() }));
vi.mock("@/services/smtpChecker", () => ({ checkSMTP: vi.fn() }));
vi.mock("@/services/genericChecker", () => ({ checkGeneric: vi.fn() }));
vi.mock("@/services/freeProviderChecker", () => ({ checkFreeProvider: vi.fn() }));
vi.mock("@/services/typoChecker", () => ({ checkTypo: vi.fn() }));
vi.mock("@/services/dnsblChecker", () => ({ checkDNSBL: vi.fn() }));
vi.mock("@/services/reputationScorer", () => ({ getDomainReputation: vi.fn() }));
vi.mock("@/services/validationCache", () => ({
  getCachedValidation: vi.fn().mockResolvedValue(null),
  setCachedValidation: vi.fn().mockResolvedValue(undefined),
  checkEmailRateLimit: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-biz", plan: "BUSINESS", credits: 0 } }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({
  loggerApi: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn() },
}));
vi.mock("@/lib/redis", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 100, resetAt: Date.now() + 60000, limit: 100 }),
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn() },
}));
vi.mock("stripe", () => ({ default: vi.fn() }));
vi.mock("resend", () => ({ Resend: vi.fn() }));
vi.mock("pino", () => ({ default: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() })) }));
vi.mock("@sentry/nextjs", () => ({ init: vi.fn(), captureMessage: vi.fn(), captureException: vi.fn(), setUser: vi.fn() }));
vi.mock("@/lib/timingSafe", () => ({ enforceTimingSafeResponse: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/ssrf", () => ({ getClientIp: vi.fn(() => "127.0.0.1") }));
vi.mock("@/lib/rateLimits", () => ({
  checkRateLimitByPlan: vi.fn().mockResolvedValue({ success: true, remaining: 100, resetAt: Date.now() + 60000, limit: 20 }),
}));

import { GET } from "@/app/api/v1/validate/route";

const VALID_EMAIL = "test@company.com";

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckFormat.mockReturnValue({ passed: true, message: "Valid format" });
  mockCheckDisposable.mockResolvedValue({ passed: true, message: "Not disposable" });
  mockValidateEmail.mockResolvedValue({
    email: VALID_EMAIL,
    score: 85,
    status: "valid",
    checks: { format: { passed: true } },
    domain: { name: "company.com", reputation: "good" },
    processingTimeMs: 150,
  });
  mockPrisma.$transaction.mockImplementation(async (fn: any) =>
    fn({
      user: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ id: "user-biz", credits: 0 }),
      },
      validation: { create: vi.fn().mockResolvedValue({ id: "val-1" }) },
    }),
  );
});

describe("GET /api/v1/validate — BUSINESS unlimited plan", () => {
  it("should NOT block a BUSINESS user with 0 stored credits (P0 regression)", async () => {
    const url = new URL(`http://localhost:3000/api/v1/validate?email=${VALID_EMAIL}`);
    const req = new NextRequest(url);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.meta.creditsUsed).toBe(1);
    expect(json.data.status).toBe("valid");
    expect(mockValidateEmail).toHaveBeenCalled();
  });

  it("should still debit usage for BUSINESS (gate bypassed, not skipped)", async () => {
    const url = new URL(`http://localhost:3000/api/v1/validate?email=${VALID_EMAIL}`);
    const res = await GET(new NextRequest(url));
    const json = await res.json();
    // BUSINESS is "unlimited" but usage is still recorded (creditsUsed:1)
    expect(json.meta.creditsUsed).toBe(1);
  });
});
