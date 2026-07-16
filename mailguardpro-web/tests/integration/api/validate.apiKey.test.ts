import { NextRequest } from "next/server";
/**
 * Integration tests for GET /api/v1/validate — API-key authentication path
 * (getAuthenticatedUser / X-API-Key).
 *
 * Owned by the validate-route engineer: covers revoked keys, missing scope,
 * orphaned users, short keys, legacy-hash migration, and a valid key that
 * authenticates and deducts a credit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPrisma,
  mockValidateEmail,
  mockCheckFormat,
  mockCheckDisposable,
  mockHashApiKey,
  mockHashApiKeyLegacy,
  mockHasScope,
} = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn().mockResolvedValue({ id: "user-key", isActive: true, credits: 4 }) },
    apiKey: { findFirst: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    validation: { create: vi.fn(), update: vi.fn() },
    session: { findMany: vi.fn().mockResolvedValue([]) },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  mockValidateEmail: vi.fn(),
  mockCheckFormat: vi.fn(),
  mockCheckDisposable: vi.fn(),
  mockHashApiKey: vi.fn(() => "HASH_NEW"),
  mockHashApiKeyLegacy: vi.fn(() => "HASH_LEGACY"),
  mockHasScope: vi.fn(() => true),
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
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/auth/require-scope", () => ({ hasScope: mockHasScope }));
vi.mock("@/lib/crypto", () => ({
  hashApiKey: mockHashApiKey,
  hashApiKeyLegacy: mockHashApiKeyLegacy,
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
import { prisma } from "@/lib/prisma";

const VALID_EMAIL = "test@company.com";

function buildReq(apiKey?: string) {
  const headers: Record<string, string> = {};
  if (apiKey) headers["X-API-Key"] = apiKey;
  return new NextRequest(new URL(`http://localhost:3000/api/v1/validate?email=${VALID_EMAIL}`), {
    headers,
  });
}

const activeKeyUser = { id: "user-key", plan: "PRO", isActive: true, credits: 4 };

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
  mockHasScope.mockReturnValue(true);
  mockPrisma.$transaction.mockImplementation(async (fn: any) =>
    fn({
      user: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ id: "user-key", credits: 3 }),
      },
      validation: { create: vi.fn().mockResolvedValue({ id: "val-1" }) },
    }),
  );
  vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
    id: "key-1",
    keyHash: "HASH_NEW",
    isActive: true,
    scopes: "validate",
    user: activeKeyUser,
  });
});

describe("GET /api/v1/validate — API-key auth path", () => {
  // ── P1: valid active key with validate scope → authenticates + deducts ──
  it("should authenticate with a valid active key and deduct a credit", async () => {
    const res = await GET(buildReq("valid-long-key-123"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.meta.creditsUsed).toBe(1);
    expect(mockValidateEmail).toHaveBeenCalled();
  });

  // ── P1: legacy-hash key → migrated then authenticates ──
  it("should migrate a legacy-hashed key and still authenticate", async () => {
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
      id: "key-legacy",
      keyHash: "HASH_LEGACY",
      isActive: true,
      scopes: "validate",
      user: activeKeyUser,
    });
    const res = await GET(buildReq("legacy-key-123"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.meta.creditsUsed).toBe(1);
    // Legacy migration write must have happened
    expect(prisma.apiKey.update).toHaveBeenCalled();
  });

  // ── P1: revoked key → rejected (anonymous, no deduction) ──
  it("should reject a revoked (isActive:false) key", async () => {
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
      id: "key-revoked",
      keyHash: "HASH_NEW",
      isActive: false,
      scopes: "validate",
      user: activeKeyUser,
    });
    const res = await GET(buildReq("revoked-key-123"));
    const json = await res.json();
    expect(json.meta.creditsUsed).toBe(0);
    expect(json.meta.note).toMatch(/Full validation requires authentication/i);
    expect(mockValidateEmail).not.toHaveBeenCalled();
  });

  // ── P1: missing validate scope → rejected ──
  it("should reject a key without the validate scope", async () => {
    mockHasScope.mockReturnValue(false);
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
      id: "key-readonly",
      keyHash: "HASH_NEW",
      isActive: true,
      scopes: "read",
      user: activeKeyUser,
    });
    const res = await GET(buildReq("readonly-key-12"));
    const json = await res.json();
    expect(json.meta.creditsUsed).toBe(0);
    expect(json.meta.note).toMatch(/Full validation requires authentication/i);
  });

  // ── P1: orphaned/deleted user → rejected ──
  it("should reject a key whose user no longer exists", async () => {
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
      id: "key-orphan",
      keyHash: "HASH_NEW",
      isActive: true,
      scopes: "validate",
      user: null,
    });
    const res = await GET(buildReq("orphan-key-123"));
    const json = await res.json();
    expect(json.meta.creditsUsed).toBe(0);
    expect(json.meta.note).toMatch(/Full validation requires authentication/i);
  });

  // ── P1: key shorter than 8 chars → rejected before lookup ──
  it("should reject a key shorter than 8 characters", async () => {
    const res = await GET(buildReq("abc"));
    const json = await res.json();
    expect(json.meta.creditsUsed).toBe(0);
    expect(json.meta.note).toMatch(/Full validation requires authentication/i);
    // No DB lookup should have happened for a too-short key
    expect(prisma.apiKey.findFirst).not.toHaveBeenCalled();
  });
});
