import { NextRequest } from "next/server";
/**
 * Integration tests for GET /api/v1/validate — authenticated (session) path.
 *
 * Covers: successful deduction + Cache-Control per plan, INSUFFICIENT_CREDITS
 * (403, no validation call, no partial write), and the pre-deduction gates
 * (format / disposable failures must not charge the user).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockValidateEmail, mockCheckFormat, mockCheckDisposable } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: "user-auth", isActive: true, credits: 5 }),
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
vi.mock("@/services/dnsChecker", () => ({
  checkMX: vi.fn(),
  checkSPF: vi.fn(),
  checkDMARC: vi.fn(),
}));
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
  auth: vi.fn().mockResolvedValue({ user: { id: "user-auth", plan: "FREE", credits: 5 } }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({
  loggerApi: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn() },
}));
vi.mock("@/lib/redis", () => ({
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, remaining: 100, resetAt: Date.now() + 60000, limit: 100 }),
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn() },
}));
vi.mock("stripe", () => ({ default: vi.fn() }));
vi.mock("resend", () => ({ Resend: vi.fn() }));
vi.mock("pino", () => ({
  default: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() })),
}));
vi.mock("@sentry/nextjs", () => ({
  init: vi.fn(),
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  setUser: vi.fn(),
}));
vi.mock("@/lib/timingSafe", () => ({
  enforceTimingSafeResponse: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/ssrf", () => ({ getClientIp: vi.fn(() => "127.0.0.1") }));
vi.mock("@/lib/rateLimits", () => ({
  checkRateLimitByPlan: vi
    .fn()
    .mockResolvedValue({ success: true, remaining: 100, resetAt: Date.now() + 60000, limit: 20 }),
}));

import { GET } from "@/app/api/v1/validate/route";
import { auth } from "@/lib/auth";

const VALID_EMAIL = "test@company.com";

function buildReq() {
  return new NextRequest(new URL(`http://localhost:3000/api/v1/validate?email=${VALID_EMAIL}`));
}

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
        findUnique: vi.fn().mockResolvedValue({ id: "user-auth", credits: 4 }),
      },
      validation: { create: vi.fn().mockResolvedValue({ id: "val-1" }) },
    }),
  );
});

describe("GET /api/v1/validate — authenticated path", () => {
  // ── P1: 200, deduction, Cache-Control per plan ──
  it.each([
    ["FREE", "s-maxage=60"],
    ["PRO", "s-maxage=300"],
  ])("should return 200 with creditsUsed:1 and plan cache headers for %s", async (plan, expectedCache) => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-auth", plan, credits: 5 } });
    const res = await GET(buildReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.meta.creditsUsed).toBe(1);
    expect(typeof json.meta.creditsRemaining).toBe("number");
    expect(res.headers.get("Cache-Control")).toContain(expectedCache);
  });

  // ── P1: INSUFFICIENT_CREDITS → 403, no validation, no partial write ──
  it("should return 403 INSUFFICIENT_CREDITS without calling validateEmail", async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        user: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findUnique: vi.fn().mockResolvedValue({ id: "user-auth", credits: 0 }),
        },
        validation: { create: vi.fn() },
      }),
    );
    const res = await GET(buildReq());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe("INSUFFICIENT_CREDITS");
    expect(mockValidateEmail).not.toHaveBeenCalled();
  });

  // ── P1: format failure → no charge ──
  it("should NOT deduct a credit when email fails format validation", async () => {
    mockCheckFormat.mockReturnValue({ passed: false, message: "Bad format" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-auth", isActive: true, credits: 5 });
    const res = await GET(buildReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.meta.creditsUsed).toBe(0);
    expect(mockValidateEmail).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  // ── P1: disposable failure → no charge ──
  it("should NOT deduct a credit when email is disposable", async () => {
    mockCheckFormat.mockReturnValue({ passed: true, message: "Valid format" });
    mockCheckDisposable.mockResolvedValue({ passed: false, message: "Disposable" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-auth", isActive: true, credits: 5 });
    const res = await GET(buildReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.meta.creditsUsed).toBe(0);
    expect(mockValidateEmail).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
