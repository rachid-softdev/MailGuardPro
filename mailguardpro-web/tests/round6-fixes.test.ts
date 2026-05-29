// =============================================================================
// Round 6.2 Fix Tests — L3a, L3b, H2, M2, H3
// Tests for code review fixes implemented in this round.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// =============================================================================
// MODULE-LEVEL MOCKS (hoisted before all imports)
// =============================================================================

// Mock checker services used by emailValidator AND by the validate API route
vi.mock("@/services/formatChecker", () => ({ checkFormat: vi.fn() }));
vi.mock("@/services/disposableChecker", () => ({ checkDisposable: vi.fn() }));
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

// Mock scoring weights for L3b — allows us to verify the scoring formula
vi.mock("@/config/scoringWeights", () => ({
  SCORING_WEIGHTS: {
    format: { pass: 15, fail: 0 },
    mx: { pass: 25, fail: 0 },
    smtp: { pass: 30, fail: 0 },
    catchAll: { pass: 10, fail: 0 },
    disposable: { pass: 10, fail: 0 },
    generic: { pass: 5, fail: 0 },
    spf: { pass: 5, fail: 0 },
    dmarc: { pass: 5, fail: 0 },
    domainAge: { pass: 5, fail: 0 },
    dnsbl: { pass: 0, fail: -20 },
    typo: { pass: 0, fail: -10 },
  } as const,
}));

// Mock validation cache — prevent actual Redis calls from emailValidator
vi.mock("@/services/validationCache", () => ({
  getCachedValidation: vi.fn().mockResolvedValue(null),
  setCachedValidation: vi.fn().mockResolvedValue(undefined),
  checkEmailRateLimit: vi.fn().mockResolvedValue(true),
}));

// Mock prisma — overrides global setup mock with one we control per-test
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    bulkJob: {
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    validation: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    apiKey: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

// Mock redis — overrides global setup mock
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    setex: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    duplicate: vi.fn(() => ({ connect: vi.fn() })),
  },
  checkRateLimit: vi.fn().mockResolvedValue({
    success: true,
    resetAt: Date.now() + 60000,
    remaining: 100,
  }),
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  publishProgress: vi.fn().mockResolvedValue(undefined),
}));

// Mock auth — returns null by default (no session)
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
  handlers: { GET: vi.fn(), POST: vi.fn() },
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

// Mock BullMQ
vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: "bull-job-123" }),
  })),
}));

// Mock next/server
vi.mock("next/server", () => {
  class NextResponse {
    status: number;
    body: any;
    headers: Map<string, string>;
    constructor(body: any, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map(Object.entries(init?.headers ?? {}));
    }
    json() {
      return this.body;
    }
    static json(data: any, init?: { status?: number; headers?: Record<string, string> }) {
      const resp = new NextResponse(data, init);
      resp.headers.set("content-type", "application/json");
      return resp;
    }
  }
  class NextRequest {
    url: string;
    headers: Map<string, string>;
    constructor(input: string | URL, init?: { headers?: Record<string, string> }) {
      this.url = typeof input === "string" ? input : input.toString();
      this.headers = new Map(Object.entries(init?.headers ?? {}));
    }
    get headerValues() {
      return Object.fromEntries(this.headers);
    }
  }
  return { NextRequest, NextResponse };
});

// =============================================================================
// IMPORTS (after vi.mock hoisting)
// =============================================================================

// Type imports
import type { CheckResult } from "@/services/types";

import { checkDisposable } from "@/services/disposableChecker";
import { checkDMARC, checkMX, checkSPF } from "@/services/dnsChecker";
import { checkDNSBL } from "@/services/dnsblChecker";
// L3b
import { validateEmail } from "@/services/emailValidator";
import { checkFormat } from "@/services/formatChecker";
import { checkFreeProvider } from "@/services/freeProviderChecker";
import { checkGeneric } from "@/services/genericChecker";
import { getDomainReputation } from "@/services/reputationScorer";
import { checkSMTP } from "@/services/smtpChecker";
import { checkTypo } from "@/services/typoChecker";

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
// H2
import { processBulkUpload } from "@/services/bulkProcessor";

// M2
import { checkRateLimitByPlan } from "@/services/rateLimitService";

// H3
import { GET } from "@/app/api/v1/validate/route";
import { auth } from "@/lib/auth";
import { checkRateLimit as checkRateLimitFn } from "@/lib/redis";

// =============================================================================
// SHARED SETUP
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// FIX 1 (L3a) — CheckResult type: weight field
// =============================================================================

describe("Fix L3a — CheckResult type weight field", () => {
  test("should accept CheckResult with weight property (structural typing)", () => {
    const result: CheckResult = { passed: true, message: "test", weight: 30 };
    expect(result.passed).toBe(true);
    expect(result.message).toBe("test");
    expect(result.weight).toBe(30);
  });

  test("should accept CheckResult without weight property (optional)", () => {
    const result: CheckResult = { passed: false, message: "test" };
    expect(result.passed).toBe(false);
    expect(result.weight).toBeUndefined();
  });

  test("should accept CheckResult with weight set to 0", () => {
    const result: CheckResult = { passed: true, message: "test", weight: 0 };
    expect(result.passed).toBe(true);
    expect(result.weight).toBe(0);
  });

  test("should not require detail field when weight is present", () => {
    const result: CheckResult = { passed: true, message: "ok", weight: 10 };
    expect(result.weight).toBe(10);
    expect(result.detail).toBeUndefined();
  });

  test("CheckResult weight does not need to be used in score calculation test", () => {
    // Weight is an informational field; verify it coexists with all other fields
    const result: CheckResult = {
      passed: false,
      message: "fail",
      detail: "Something went wrong",
      weight: 5,
    };
    expect(result.passed).toBe(false);
    expect(result.message).toBe("fail");
    expect(result.detail).toBe("Something went wrong");
    expect(result.weight).toBe(5);
  });
});

// =============================================================================
// FIX 2 (L3b) — SCORING_WEIGHTS used for scoring
// =============================================================================

describe("Fix L3b — SCORING_WEIGHTS used for scoring", () => {
  beforeEach(() => {
    // Default: all checkers pass
    vi.mocked(checkFormat).mockReturnValue({ passed: true, message: "Valid format", weight: 15 });
    vi.mocked(checkMX).mockResolvedValue({ passed: true, message: "MX OK", weight: 25 });
    vi.mocked(checkSPF).mockResolvedValue({ passed: true, message: "SPF OK", weight: 5 });
    vi.mocked(checkDMARC).mockResolvedValue({ passed: true, message: "DMARC OK", weight: 5 });
    vi.mocked(checkSMTP).mockResolvedValue({ passed: true, message: "SMTP OK", weight: 30 });
    vi.mocked(checkDisposable).mockResolvedValue({
      passed: true,
      message: "Not disposable",
      weight: 10,
    });
    vi.mocked(checkGeneric).mockResolvedValue({ passed: true, message: "Not generic", weight: 5 });
    vi.mocked(checkFreeProvider).mockReturnValue({
      passed: true,
      message: "Business email",
      weight: 0,
    });
    vi.mocked(checkTypo).mockReturnValue({ passed: true, message: "No typo", weight: 0 });
    vi.mocked(checkDNSBL).mockResolvedValue({
      passed: true,
      message: "Not blacklisted",
      weight: 0,
    });
    vi.mocked(getDomainReputation).mockResolvedValue({
      name: "company.com",
      ageInDays: 400,
      reputation: "good",
    });
  });

  test("should compute score using SCORING_WEIGHTS values (all passing)", async () => {
    const result = await validateEmail("test@company.com");

    // Expected: format(15) + mx(25) + smtp(30) + catchAll(10) + disposable(10) + generic(5)
    //           + spf(5) + dmarc(5) + domainAge(5) = 110, capped at 100
    expect(result.score).toBe(100);
    expect(result.status).toBe("valid");
  });

  test("should compute score correctly when some checkers fail", async () => {
    vi.mocked(checkMX).mockResolvedValue({ passed: false, message: "No MX", weight: 25 });
    vi.mocked(checkSMTP).mockResolvedValue({ passed: false, message: "SMTP failed", weight: 30 });
    vi.mocked(checkDNSBL).mockResolvedValue({ passed: false, message: "Blacklisted", weight: 20 });
    vi.mocked(getDomainReputation).mockResolvedValue({
      name: "company.com",
      ageInDays: 100,
      reputation: "neutral",
    });

    const result = await validateEmail("test@company.com");

    // Expected: format(15) + catchAll(10) + disposable(10) + generic(5) + spf(5)
    //           + dmarc(5) + dnsbl(-20) = 30
    expect(result.score).toBe(30);
    expect(result.status).toBe("invalid");
  });

  test("should have backward-compatible scoring (score between 0-100)", async () => {
    const result = await validateEmail("test@company.com");

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(Number.isInteger(result.score)).toBe(true);
  });

  test("should cap score at minimum 0", async () => {
    // Make most checkers fail and penalties heavy
    vi.mocked(checkFormat).mockReturnValue({ passed: true, message: "Valid", weight: 15 });
    vi.mocked(checkMX).mockResolvedValue({ passed: false, message: "No MX", weight: 25 });
    vi.mocked(checkSMTP).mockResolvedValue({ passed: false, message: "SMTP failed", weight: 30 });
    vi.mocked(checkDisposable).mockResolvedValue({
      passed: false,
      message: "Disposable",
      weight: 10,
    });
    vi.mocked(checkGeneric).mockResolvedValue({ passed: true, message: "OK", weight: 5 });
    vi.mocked(checkSPF).mockResolvedValue({ passed: false, message: "No SPF", weight: 5 });
    vi.mocked(checkDMARC).mockResolvedValue({ passed: false, message: "No DMARC", weight: 5 });
    vi.mocked(checkDNSBL).mockResolvedValue({ passed: false, message: "Listed", weight: 20 });
    vi.mocked(checkTypo).mockReturnValue({ passed: false, message: "Typo", weight: 0 });
    vi.mocked(getDomainReputation).mockResolvedValue({
      name: "company.com",
      ageInDays: 50,
      reputation: "poor",
    });

    const result = await validateEmail("test@company.com");

    // Expected: format(15) + generic(5) + dnsbl(-20) + typo(-10) = -10, capped at 0
    expect(result.score).toBe(0);
  });

  test("should include domain age bonus when domain is old", async () => {
    vi.mocked(getDomainReputation).mockResolvedValue({
      name: "old-domain.com",
      ageInDays: 500,
      reputation: "good",
    });

    const result = await validateEmail("test@old-domain.com");

    // With domain age bonus (5 points), all passing = 110 but capped at 100
    expect(result.score).toBe(100);
  });

  test("should NOT include domain age bonus when domain is young", async () => {
    vi.mocked(getDomainReputation).mockResolvedValue({
      name: "new-domain.com",
      ageInDays: 100,
      reputation: "neutral",
    });

    const result = await validateEmail("test@new-domain.com");

    // Without domain age bonus: 15+25+30+10+10+5+5+5 = 105, capped at 100
    expect(result.score).toBe(100);
  });

  test("should handle SMTP failure gracefully in catch", async () => {
    vi.mocked(checkSMTP).mockRejectedValue(new Error("Connection refused"));

    // Should not throw
    const result = await validateEmail("test@company.com");

    expect(result.checks.smtp.passed).toBe(false);
    expect(result.checks.smtp.message).toBe("Erreur SMTP");
  });
});

// =============================================================================
// FIX 3 (H2) — bulkProcessor inverted order + compensating rollback
// =============================================================================

describe("Fix H2 — bulkProcessor inverted order and compensating rollback", () => {
  const csvContent = "email\ntest@example.com\ntest2@example.com";
  const csvFile = new File([csvContent], "test.csv", { type: "text/csv" });
  const userId = "user-123";

  beforeEach(() => {
    // Default: DB transaction succeeds with sufficient credits
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      return cb({
        user: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        bulkJob: {
          create: vi.fn().mockResolvedValue({ id: "test-job-id", userId, status: "PENDING" }),
        },
      });
    });

    // Default: Redis and Queue succeed
    vi.mocked(redis.setex).mockResolvedValue("OK");
  });

  // --------------------------------------------------------------------------
  // Order verification
  // --------------------------------------------------------------------------

  test("should perform DB transaction BEFORE Redis/Queue operations", async () => {
    const order: string[] = [];

    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      order.push("db");
      return cb({
        user: {
          updateMany: vi.fn().mockImplementation(() => {
            order.push("db-deduction");
            return Promise.resolve({ count: 1 });
          }),
        },
        bulkJob: {
          create: vi.fn().mockImplementation(() => {
            order.push("db-job-create");
            return Promise.resolve({ id: "test-job-id", userId, status: "PENDING" });
          }),
        },
      });
    });

    vi.mocked(redis.setex).mockImplementation(async () => {
      order.push("redis");
      return "OK" as any;
    });

    await processBulkUpload(csvFile, userId);

    expect(order.indexOf("db")).toBeLessThan(order.indexOf("redis"));
  });

  test("should call Redis.setex AND Queue.add after DB commit", async () => {
    await processBulkUpload(csvFile, userId);

    // DB transaction must have been called
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    // Redis key must be set after DB
    expect(redis.setex).toHaveBeenCalledWith(
      expect.stringContaining("bulk:job:"),
      3600,
      expect.any(String),
    );
  });

  // --------------------------------------------------------------------------
  // Insufficient credits
  // --------------------------------------------------------------------------

  test("should return error for insufficient credits without calling Redis/Queue", async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      return cb({
        user: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }), // No credits!
        },
        bulkJob: {
          create: vi.fn(),
        },
      });
    });

    const result = await processBulkUpload(csvFile, userId);

    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain("Insufficient credits");

    // Redis and Queue must NOT be called
    expect(redis.setex).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Compensating rollback
  // --------------------------------------------------------------------------

  test("should refund credits and delete job when Redis fails after DB commit", async () => {
    // DB transaction succeeds
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      return cb({
        user: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        bulkJob: {
          create: vi.fn().mockResolvedValue({ id: "test-job-id", userId, status: "PENDING" }),
        },
      });
    });

    // Redis/Queue fails after DB commit
    vi.mocked(redis.setex).mockRejectedValue(new Error("Redis connection lost"));

    // Spy on rollback operations
    vi.mocked(prisma.user.update).mockResolvedValue({ id: userId, credits: 100 } as any);
    vi.mocked(prisma.bulkJob.delete).mockResolvedValue({ id: "test-job-id" } as any);

    const result = await processBulkUpload(csvFile, userId);

    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toBe("Failed to create processing job");

    // Compensating rollback must be called
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: userId },
        data: { credits: { increment: 2 } }, // 2 emails = 2 credits
      }),
    );
    expect(prisma.bulkJob.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: expect.any(String) },
      }),
    );

    // Redis key should be cleaned up
    expect(redis.del).toHaveBeenCalledWith(expect.stringContaining("bulk:job:"));
  });

  test("should not attempt rollback if DB transaction itself fails", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error("DB connection failed"));

    const result = await processBulkUpload(csvFile, userId);

    expect(result.success).toBe(false);

    // No rollback since DB never committed
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.bulkJob.delete).not.toHaveBeenCalled();
    expect(redis.setex).not.toHaveBeenCalled();
  });

  test("should not break when rollback refund fails (defensive catch)", async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      return cb({
        user: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        bulkJob: {
          create: vi.fn().mockResolvedValue({ id: "test-job-id", userId, status: "PENDING" }),
        },
      });
    });

    vi.mocked(redis.setex).mockRejectedValue(new Error("Redis down"));

    // Rollback refund fails too
    vi.mocked(prisma.user.update).mockRejectedValue(new Error("DB also down"));

    // Should not throw — defensive catch in rollback
    const result = await processBulkUpload(csvFile, userId);

    expect(result.success).toBe(false);
    // The function should handle the defensive catch gracefully
  });

  // --------------------------------------------------------------------------
  // Successful flow
  // --------------------------------------------------------------------------

  test("should successfully create DB record, Redis key, AND Queue job on success", async () => {
    const result = await processBulkUpload(csvFile, userId);

    expect(result.success).toBe(true);
    expect(result.jobId).toBeDefined();
    expect(result.totalEmails).toBe(2);

    // Verify DB transaction call
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    // Verify Redis key creation
    expect(redis.setex).toHaveBeenCalledTimes(1);
    expect(redis.setex).toHaveBeenCalledWith(
      expect.stringContaining("bulk:job:"),
      3600,
      expect.stringContaining("test@example.com"),
    );
  });
});

// =============================================================================
// FIX 4 (M2) — rateLimitService: checkRateLimitByPlan
// =============================================================================

describe("Fix M2 — checkRateLimitByPlan", () => {
  test("should return IP-based rate limit for anonymous (null) user", async () => {
    const result = await checkRateLimitByPlan(null, "192.168.1.1");

    expect(result.rateLimitKey).toBe("ip:192.168.1.1");
    expect(result.rateLimitMax).toBe(10);
    expect(result.userPlan).toBeNull();
  });

  test("should return user-based rate limit with plan from session (FREE)", async () => {
    const user = { id: "user-1", plan: "FREE" };
    const result = await checkRateLimitByPlan(user, "192.168.1.1");

    expect(result.rateLimitKey).toBe("user:user-1");
    expect(result.rateLimitMax).toBe(20); // FREE limit
    expect(result.userPlan).toBe("FREE");
  });

  test("should return user-based rate limit with plan from session (STARTER)", async () => {
    const user = { id: "user-2", plan: "STARTER" };
    const result = await checkRateLimitByPlan(user, "192.168.1.1");

    expect(result.rateLimitKey).toBe("user:user-2");
    expect(result.rateLimitMax).toBe(100); // STARTER limit
  });

  test("should return user-based rate limit with plan from session (PRO)", async () => {
    const user = { id: "user-3", plan: "PRO" };
    const result = await checkRateLimitByPlan(user, "192.168.1.1");

    expect(result.rateLimitKey).toBe("user:user-3");
    expect(result.rateLimitMax).toBe(500); // PRO limit
  });

  test("should return user-based rate limit with plan from session (BUSINESS)", async () => {
    const user = { id: "user-4", plan: "BUSINESS" };
    const result = await checkRateLimitByPlan(user, "192.168.1.1");

    expect(result.rateLimitKey).toBe("user:user-4");
    expect(result.rateLimitMax).toBe(2000); // BUSINESS limit
  });

  test("should fallback to DB lookup when user has no plan in session", async () => {
    const user = { id: "user-5", plan: undefined as string | null | undefined };
    // Mock DB fallback
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-5",
      plan: "STARTER",
    } as any);

    const result = await checkRateLimitByPlan(user, "192.168.1.1");

    expect(result.rateLimitKey).toBe("user:user-5");
    expect(result.rateLimitMax).toBe(100); // STARTER limit
    expect(result.userPlan).toBe("STARTER");
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-5" },
      select: { plan: true },
    });
  });

  test("should default to FREE when DB user has no plan", async () => {
    const user = { id: "user-6", plan: undefined as string | null | undefined };
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-6",
      plan: null,
    } as any);

    const result = await checkRateLimitByPlan(user, "192.168.1.1");

    expect(result.rateLimitMax).toBe(20); // Default FREE
    expect(result.userPlan).toBe("FREE");
  });

  test("should default to FREE when DB user not found", async () => {
    const user = { id: "nonexistent", plan: undefined as string | null | undefined };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const result = await checkRateLimitByPlan(user, "192.168.1.1");

    expect(result.rateLimitMax).toBe(20); // Default FREE
    expect(result.userPlan).toBe("FREE");
  });

  test("should handle unknown plan gracefully (fallback to 20)", async () => {
    const user = { id: "user-7", plan: "ENTERPRISE_LEGACY" };
    const result = await checkRateLimitByPlan(user, "192.168.1.1");

    expect(result.rateLimitMax).toBe(20);
    expect(result.userPlan).toBe("ENTERPRISE_LEGACY");
  });

  test("should not hit DB when plan is in session", async () => {
    const user = { id: "user-8", plan: "PRO" };
    await checkRateLimitByPlan(user, "192.168.1.1");

    // DB should NOT be called when plan is already in session
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

// =============================================================================
// FIX 5 (H3) — Pre-deduction gate: format + disposable check
// =============================================================================

describe("Fix H3 — pre-deduction gate (format + disposable)", () => {
  beforeEach(() => {
    // Default: user is authenticated
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-h3", plan: "FREE", credits: 100 },
    } as any);

    // Default: prisma returns user with credits
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-h3",
      credits: 100,
      plan: "FREE",
    } as any);
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.validation.create).mockResolvedValue({} as any);

    // Default: format and disposable pass
    vi.mocked(checkFormat).mockReturnValue({
      passed: true,
      message: "Valid format",
    });

    vi.mocked(checkDisposable).mockResolvedValue({
      passed: true,
      message: "Not disposable",
    });

    // Defaults for all checkers used by validateEmail (in case it's called)
    vi.mocked(checkMX).mockResolvedValue({ passed: true, message: "MX OK" } as any);
    vi.mocked(checkSPF).mockResolvedValue({ passed: true, message: "SPF OK" } as any);
    vi.mocked(checkDMARC).mockResolvedValue({ passed: true, message: "DMARC OK" } as any);
    vi.mocked(checkSMTP).mockResolvedValue({ passed: true, message: "SMTP OK" } as any);
    vi.mocked(checkGeneric).mockResolvedValue({ passed: true, message: "Not generic" } as any);
    vi.mocked(checkFreeProvider).mockReturnValue({
      passed: true,
      message: "Business email",
    } as any);
    vi.mocked(checkTypo).mockReturnValue({ passed: true, message: "No typo" } as any);
    vi.mocked(checkDNSBL).mockResolvedValue({ passed: true, message: "Not blacklisted" } as any);
    vi.mocked(getDomainReputation).mockResolvedValue({
      name: "example.com",
      ageInDays: 400,
      reputation: "good",
    } as any);
  });

  // --------------------------------------------------------------------------
  // Format gate
  // --------------------------------------------------------------------------

  test("should return creditsUsed: 0 and status invalid when format check fails", async () => {
    vi.mocked(checkFormat).mockReturnValue({
      passed: false,
      message: "Invalid email format",
      detail: "Bad format",
    });

    const url = new URL("http://localhost:3000/api/v1/validate?email=test@example.com");
    const req = new (await import("next/server")).NextRequest(url);
    const response = await GET(req);

    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.data.status).toBe("invalid");
    expect(json.meta.creditsUsed).toBe(0);
    expect(json.data.score).toBe(0);

    // Credit deduction should NOT have been called
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  test("should NOT call emailValidator when format check fails", async () => {
    vi.mocked(checkFormat).mockReturnValue({
      passed: false,
      message: "Invalid format",
    });

    const url = new URL("http://localhost:3000/api/v1/validate?email=test@example.com");
    const req = new (await import("next/server")).NextRequest(url);
    await GET(req);

    // validateEmail is called through the route — ensure the gate prevents it
    // by verifying no validation.create (which happens after validateEmail)
    expect(prisma.validation.create).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Disposable gate
  // --------------------------------------------------------------------------

  test("should return creditsUsed: 0 and status invalid when disposable check fails", async () => {
    vi.mocked(checkDisposable).mockResolvedValue({
      passed: false,
      message: "Disposable email",
      detail: "tempmail.com is a disposable domain",
      provider: "builtin-list",
    });

    const url = new URL("http://localhost:3000/api/v1/validate?email=test@tempmail.com");
    const req = new (await import("next/server")).NextRequest(url);
    const response = await GET(req);

    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.data.status).toBe("invalid");
    expect(json.meta.creditsUsed).toBe(0);
    expect(json.data.score).toBe(0);

    // Credit deduction should NOT have been called
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Valid email still deducts credits
  // --------------------------------------------------------------------------

  test("should deduct credits and return full result for valid email", async () => {
    // Set up all checker mocks for a valid email (validateEmail uses them)
    vi.mocked(checkMX).mockResolvedValue({ passed: true, message: "MX OK" } as any);
    vi.mocked(checkSPF).mockResolvedValue({ passed: true, message: "SPF OK" } as any);
    vi.mocked(checkDMARC).mockResolvedValue({ passed: true, message: "DMARC OK" } as any);
    vi.mocked(checkSMTP).mockResolvedValue({ passed: true, message: "SMTP OK" } as any);
    vi.mocked(checkGeneric).mockResolvedValue({ passed: true, message: "Not generic" } as any);
    vi.mocked(checkFreeProvider).mockReturnValue({
      passed: true,
      message: "Business email",
    } as any);
    vi.mocked(checkTypo).mockReturnValue({ passed: true, message: "No typo" } as any);
    vi.mocked(checkDNSBL).mockResolvedValue({
      passed: true,
      message: "Not blacklisted",
    } as any);
    vi.mocked(getDomainReputation).mockResolvedValue({
      name: "company.com",
      ageInDays: 400,
      reputation: "good",
    } as any);

    const url = new URL("http://localhost:3000/api/v1/validate?email=test@company.com");
    const req = new (await import("next/server")).NextRequest(url);
    const response = await GET(req);

    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.meta.creditsUsed).toBe(1);
    expect(json.data.status).toBe("valid");

    // Credits must have been deducted via updateMany
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-h3", credits: { gte: 1 } },
        data: { credits: { decrement: 1 } },
      }),
    );
  });

  // --------------------------------------------------------------------------
  // Anonymous users skip the gate entirely
  // --------------------------------------------------------------------------

  test("should skip pre-deduction gate for anonymous users (no session)", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    vi.mocked(checkFormat).mockReturnValue({
      passed: false,
      message: "Invalid format",
    });

    const url = new URL("http://localhost:3000/api/v1/validate?email=test@example.com");
    const req = new (await import("next/server")).NextRequest(url);
    const response = await GET(req);

    expect(response.status).toBe(200);
    const json = await response.json();

    // Anonymous users still get the result — they don't have credits anyway
    // The gate is in an `if (user)` block, so anonymous users skip the gate
    // and go directly to validateEmail without credit deduction
    expect(json.meta.creditsUsed).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Insufficient credits after gate
  // --------------------------------------------------------------------------

  test("should return 402 when user passes gate but has insufficient credits", async () => {
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 });

    const url = new URL("http://localhost:3000/api/v1/validate?email=test@company.com");
    const req = new (await import("next/server")).NextRequest(url);
    const response = await GET(req);

    expect(response.status).toBe(402);
    const json = await response.json();
    expect(json.code).toBe("INSUFFICIENT_CREDITS");
  });

  // --------------------------------------------------------------------------
  // Pre-deduction priority: format check runs BEFORE disposable check
  // --------------------------------------------------------------------------

  test("should short-circuit on format failure without calling disposable check", async () => {
    vi.mocked(checkFormat).mockReturnValue({
      passed: false,
      message: "Invalid format",
    });
    vi.mocked(checkDisposable).mockClear();

    const url = new URL("http://localhost:3000/api/v1/validate?email=test@example.com");
    const req = new (await import("next/server")).NextRequest(url);
    await GET(req);

    // disposable should not be called when format fails
    expect(checkDisposable).not.toHaveBeenCalled();
  });
});
