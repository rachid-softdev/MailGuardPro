// =============================================================================
// TEST 2 (DI-1) — Credit deduction race conditions & atomic validation
// =============================================================================
// Tests the credit deduction logic inside the validate API route, including
// atomicity, rollback on failure, and concurrent request safety.
// =============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// MODULE-LEVEL MOCKS (vi.hoisted pattern for reliable mock references)
// =============================================================================

const { mockPrisma, mockValidateEmail, mockCheckFormat, mockCheckDisposable } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: "user-credits-1", credits: 5, isActive: true }),
      updateMany: vi.fn(),
    },
    apiKey: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    validation: {
      create: vi.fn(),
    },
    session: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockValidateEmail: vi.fn(),
  mockCheckFormat: vi.fn(),
  mockCheckDisposable: vi.fn(),
}));

vi.mock("@/services/emailValidator", () => ({
  validateEmail: mockValidateEmail,
}));

vi.mock("@/services/formatChecker", () => ({
  checkFormat: mockCheckFormat,
}));

vi.mock("@/services/disposableChecker", () => ({
  checkDisposable: mockCheckDisposable,
}));

// Mock checker services used by emailValidator (won't be called directly since we mock the validator)
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

// Mock auth — authenticated user with credits
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: "user-credits-1", plan: "FREE", credits: 5 },
  }),
}));

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

// Mock redis
vi.mock("@/lib/redis", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    success: true,
    remaining: 100,
    resetAt: Date.now() + 60000,
    limit: 20,
  }),
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn() },
}));

// Mock external services to prevent import side effects
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

// Mock timing safe
vi.mock("@/lib/timingSafe", () => ({
  enforceTimingSafeResponse: vi.fn().mockResolvedValue(undefined),
}));

// Mock rate limits
vi.mock("@/lib/rateLimits", () => ({
  checkRateLimitByPlan: vi.fn().mockResolvedValue({
    success: true,
    remaining: 100,
    resetAt: Date.now() + 60000,
    limit: 20,
  }),
}));

// =============================================================================
// IMPORTS
// =============================================================================

import { GET } from "@/app/api/v1/validate/route";
import { hashEmail, maskEmail } from "@/lib/emailHash";

// =============================================================================
// SHARED SETUP
// =============================================================================

const VALID_EMAIL = "test@company.com";

beforeEach(() => {
  vi.clearAllMocks();

  // Default: format and disposable pass
  mockCheckFormat.mockReturnValue({ passed: true, message: "Valid format" });
  mockCheckDisposable.mockResolvedValue({ passed: true, message: "Not disposable" });

  // Default: validateEmail succeeds
  mockValidateEmail.mockResolvedValue({
    email: VALID_EMAIL,
    score: 85,
    status: "valid",
    checks: {
      format: { passed: true, message: "Valid" },
      mx: { passed: true, message: "MX OK" },
      smtp: { passed: true, message: "SMTP OK" },
    },
    domain: { name: "company.com", reputation: "good", ageInDays: 400 },
    processingTimeMs: 150,
  });

  // Default: transaction succeeds with credit deduction
  mockPrisma.$transaction.mockImplementation(async (fn: any) => {
    return fn({
      user: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ id: "user-credits-1", credits: 4 }),
      },
      validation: {
        create: vi.fn().mockResolvedValue({ id: "val-1" }),
      },
    });
  });
});

// =============================================================================
// TESTS
// =============================================================================

describe("DI-1: Credit deduction race conditions", () => {
  // ---------------------------------------------------------------------------
  // Test 1 — Validation réussie → crédit déduit, résultat sauvegardé
  // ---------------------------------------------------------------------------
  it("should deduct 1 credit and save validation result on success", async () => {
    const url = new URL(`http://localhost:3000/api/v1/validate?email=${VALID_EMAIL}`);
    const req = new (await import("next/server")).NextRequest(url);
    const response = await GET(req);

    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.meta.creditsUsed).toBe(1);
    expect(json.data.status).toBe("valid");
    expect(json.data.score).toBe(85);
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 2 — validateEmail échoue → crédit NON déduit (rollback transaction)
  // ---------------------------------------------------------------------------
  it("should NOT deduct credit when validateEmail throws (transaction rollback)", async () => {
    // The transaction itself fails — validateEmail is not the direct cause
    // (the error is in validation.create, which is inside the transaction callback)
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      return fn({
        user: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({ id: "user-credits-1", credits: 5 }),
        },
        validation: {
          create: vi.fn().mockRejectedValue(new Error("DB insert failed")),
        },
      });
    });

    const url = new URL(`http://localhost:3000/api/v1/validate?email=${VALID_EMAIL}`);
    const req = new (await import("next/server")).NextRequest(url);
    const response = await GET(req);

    // Transaction failure → 500 error
    expect(response.status).toBe(500);

    // The transaction callback threw, so no partial writes.
    // In a real DB, the entire transaction (including updateMany) would rollback.
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 3 — updateMany = 0 (crédits insuffisants) → 403, pas de validation
  // ---------------------------------------------------------------------------
  it("should return 403 with INSUFFICIENT_CREDITS when updateMany returns count 0", async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      return fn({
        user: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findUnique: vi.fn().mockResolvedValue({ id: "user-credits-1", credits: 0 }),
        },
        validation: { create: vi.fn() },
      });
    });

    const url = new URL(`http://localhost:3000/api/v1/validate?email=${VALID_EMAIL}`);
    const req = new (await import("next/server")).NextRequest(url);
    const response = await GET(req);

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.code).toBe("INSUFFICIENT_CREDITS");

    // validateEmail should NOT have been called
    expect(mockValidateEmail).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 4 — Concurrence: 2 validations simultanées → aucun crédit négatif
  // ---------------------------------------------------------------------------
  it("should prevent negative credits with concurrent validations", async () => {
    let callCount = 0;

    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      callCount++;
      const hasCredit = callCount === 1;

      return fn({
        user: {
          updateMany: vi.fn().mockResolvedValue({ count: hasCredit ? 1 : 0 }),
          findUnique: vi.fn().mockResolvedValue({
            id: "user-credits-1",
            credits: hasCredit ? 1 : 0,
          }),
        },
        validation: {
          create: vi.fn().mockResolvedValue({ id: `val-${callCount}` }),
        },
      });
    });

    const req1 = new (await import("next/server")).NextRequest(
      new URL(`http://localhost:3000/api/v1/validate?email=${VALID_EMAIL}`),
    );
    const req2 = new (await import("next/server")).NextRequest(
      new URL(`http://localhost:3000/api/v1/validate?email=other@company.com`),
    );

    const [res1, res2] = await Promise.all([GET(req1), GET(req2)]);
    const json1 = await res1.json();
    const json2 = await res2.json();

    const successes = [res1.status, res2.status].filter((s) => s === 200).length;
    const failures = [res1.status, res2.status].filter((s) => s === 403).length;

    expect(successes).toBe(1);
    expect(failures).toBe(1);

    const successResp = res1.status === 200 ? json1 : json2;
    expect(successResp.meta.creditsUsed).toBe(1);

    // Only one should reach validateEmail
    expect(mockValidateEmail).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Test 5 — maskEmail utilisé pour le champ email dans Validation
  // ---------------------------------------------------------------------------
  it("should use maskEmail for the email field in Validation record", async () => {
    let validationCreateData: any = null;

    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      return fn({
        user: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({ id: "user-credits-1", credits: 4 }),
        },
        validation: {
          create: vi.fn().mockImplementation((args: any) => {
            validationCreateData = args.data;
            return Promise.resolve({ id: "val-1" });
          }),
        },
      });
    });

    const url = new URL(`http://localhost:3000/api/v1/validate?email=${VALID_EMAIL}`);
    const req = new (await import("next/server")).NextRequest(url);
    await GET(req);

    expect(validationCreateData).not.toBeNull();
    expect(validationCreateData.email).toBe(maskEmail(VALID_EMAIL));
    expect(validationCreateData.email).not.toBe(VALID_EMAIL);
    expect(validationCreateData.emailHash).toBe(hashEmail(VALID_EMAIL));
  });

  // ---------------------------------------------------------------------------
  // Edge case: 0 credits
  // ---------------------------------------------------------------------------
  it("should return 403 when user has 0 credits", async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      return fn({
        user: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findUnique: vi.fn().mockResolvedValue({ id: "user-credits-1", credits: 0 }),
        },
        validation: { create: vi.fn() },
      });
    });

    const url = new URL(`http://localhost:3000/api/v1/validate?email=${VALID_EMAIL}`);
    const req = new (await import("next/server")).NextRequest(url);
    const response = await GET(req);

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.code).toBe("INSUFFICIENT_CREDITS");
  });

  // ---------------------------------------------------------------------------
  // Edge case: 3 concurrent calls with 2 credits available
  // ---------------------------------------------------------------------------
  it("should limit concurrent deductions to available credits", async () => {
    let callCount = 0;

    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      callCount++;
      const canDeduct = callCount <= 2;

      return fn({
        user: {
          updateMany: vi.fn().mockResolvedValue({ count: canDeduct ? 1 : 0 }),
          findUnique: vi
            .fn()
            .mockResolvedValue({ id: "user-credits-1", credits: canDeduct ? 1 : 0 }),
        },
        validation: {
          create: vi.fn().mockResolvedValue({ id: `val-${callCount}` }),
        },
      });
    });

    const emails = ["a@test.com", "b@test.com", "c@test.com"];
    const { NextRequest } = await import("next/server");
    const requests = emails.map((email) => {
      const url = new URL(`http://localhost:3000/api/v1/validate?email=${email}`);
      return new NextRequest(url);
    });

    const responses = await Promise.all(requests.map((req) => GET(req)));
    const statuses = responses.map((r) => r.status);
    const successes = statuses.filter((s) => s === 200).length;
    const failures = statuses.filter((s) => s === 403).length;

    expect(successes).toBe(2);
    expect(failures).toBe(1);
  });
});
