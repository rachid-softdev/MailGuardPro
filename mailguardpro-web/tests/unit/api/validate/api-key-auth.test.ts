// =============================================================================
// AUTH-1: API Key Authentication Tests
// Tests the API key authentication flow inside getAuthenticatedUser.
// Covers: valid key, short key, not-found, legacy hash migration,
// inactive key, inactive user, scope rejection, orphaned key.
// =============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// HOISTED MOCK REFERENCES
// =============================================================================

const {
  mockAuth,
  mockPrisma,
  mockHashApiKey,
  mockHashApiKeyLegacy,
  mockHasScope,
  mockCheckRateLimitByPlan,
  mockCheckRateLimit,
  mockGetClientIp,
  mockEnforceTimingSafeResponse,
  mockCheckFormat,
  mockCheckDisposable,
  mockValidateEmail,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockPrisma: {
    apiKey: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    validation: {
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockHashApiKey: vi.fn(),
  mockHashApiKeyLegacy: vi.fn(),
  mockHasScope: vi.fn(),
  mockCheckRateLimitByPlan: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockGetClientIp: vi.fn(),
  mockEnforceTimingSafeResponse: vi.fn(),
  mockCheckFormat: vi.fn(),
  mockCheckDisposable: vi.fn(),
  mockValidateEmail: vi.fn(),
}));

// =============================================================================
// MODULE MOCKS
// =============================================================================

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
      return JSON.parse(this.body);
    }
    static json(data: any, init?: { status?: number; headers?: Record<string, string> }) {
      const resp = new NextResponse(JSON.stringify(data), init);
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
  }
  return { NextRequest, NextResponse };
});

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/crypto", () => ({
  hashApiKey: mockHashApiKey,
  hashApiKeyLegacy: mockHashApiKeyLegacy,
}));
vi.mock("@/lib/auth/require-scope", () => ({ hasScope: mockHasScope }));
vi.mock("@/lib/rateLimits", () => ({ checkRateLimitByPlan: mockCheckRateLimitByPlan }));
vi.mock("@/lib/redis", () => ({ checkRateLimit: mockCheckRateLimit }));
vi.mock("@/lib/ssrf", () => ({ getClientIp: mockGetClientIp }));
vi.mock("@/lib/timingSafe", () => ({
  enforceTimingSafeResponse: mockEnforceTimingSafeResponse,
}));
vi.mock("@/lib/logger", () => ({
  loggerApi: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/lib/emailHash", () => ({
  hashEmail: vi.fn((email: string) => `hash:${email}`),
  maskEmail: vi.fn((email: string) => email),
}));
vi.mock("@/services/formatChecker", () => ({ checkFormat: mockCheckFormat }));
vi.mock("@/services/disposableChecker", () => ({
  checkDisposable: mockCheckDisposable,
}));
vi.mock("@/services/emailValidator", () => ({
  validateEmail: mockValidateEmail,
}));

// Silence console.error for expected error paths
vi.spyOn(console, "error").mockImplementation(() => {});

// =============================================================================
// IMPORTS
// =============================================================================

import { GET } from "@/app/api/v1/validate/route";

// =============================================================================
// TEST DATA
// =============================================================================

const VALID_EMAIL = "test@example.com";
const API_KEY_VALUE = "sk-valid-api-key-12345";

/** A fully valid key record returned by prisma.apiKey.findFirst. */
const validKeyRecord = {
  id: "key-1",
  keyHash: "hashed-key-value",
  isActive: true,
  scopes: "full",
  user: {
    id: "user-1",
    isActive: true,
    plan: "FREE" as const,
    credits: 100,
  },
};

// =============================================================================
// SHARED SETUP
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();

  // --- getAuthenticatedUser: session path ---
  // auth() returns null so we exercise the API-key path
  mockAuth.mockResolvedValue(null);

  // --- getAuthenticatedUser: hashing ---
  mockHashApiKey.mockReturnValue("hashed-key-value");
  mockHashApiKeyLegacy.mockReturnValue("legacy-hashed-key-value");

  // --- getAuthenticatedUser: DB lookup ---
  // Default: no key found -> falls back to anonymous
  mockPrisma.apiKey.findFirst.mockResolvedValue(null);
  mockPrisma.apiKey.update.mockResolvedValue({});

  // --- Anonymous path defaults ---
  mockGetClientIp.mockReturnValue("127.0.0.1");
  mockCheckRateLimit.mockResolvedValue({
    success: true,
    remaining: 10,
    resetAt: Date.now() + 60000,
    limit: 10,
  });
  mockCheckFormat.mockReturnValue({ passed: true, message: "Valid format" });
  mockCheckDisposable.mockResolvedValue({
    passed: true,
    message: "Not disposable",
    detail: "",
  });

  // --- Authenticated path defaults (for valid-key test) ---
  mockCheckRateLimitByPlan.mockResolvedValue({
    success: true,
    remaining: 100,
    resetAt: Date.now() + 60000,
    limit: 100,
  });
  mockValidateEmail.mockResolvedValue({
    email: VALID_EMAIL,
    score: 85,
    status: "valid",
    checks: {},
    processingTimeMs: 100,
  });
  mockPrisma.$transaction.mockImplementation(async (fn: any) => {
    return fn({
      user: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ credits: 99 }),
      },
      validation: {
        create: vi.fn().mockResolvedValue({ id: "val-1" }),
      },
    });
  });
  mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", credits: 99 });
  mockPrisma.validation.create.mockResolvedValue({ id: "val-1" });
  mockPrisma.validation.update.mockResolvedValue({ id: "val-1" });

  // --- Scope check ---
  mockHasScope.mockReturnValue(true);
});

// =============================================================================
// TESTS
// =============================================================================

describe("AUTH-1: API Key Authentication", () => {
  // --------------------------------------------------------------------------
  // Helper: create a GET request with optional X-API-Key header
  // --------------------------------------------------------------------------
  async function createRequest(apiKey?: string) {
    const { NextRequest } = await import("next/server");
    const url = new URL(`http://localhost:3000/api/v1/validate?email=${VALID_EMAIL}`);
    return new NextRequest(url, {
      headers: apiKey ? { "X-API-Key": apiKey } : undefined,
    });
  }

  // --------------------------------------------------------------------------
  // Test 1 — Valid API key returns 200 with full validation result
  // --------------------------------------------------------------------------
  it("should return 200 with full validation result for a valid API key", async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue(validKeyRecord);

    const req = await createRequest(API_KEY_VALUE);
    const response = await GET(req);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.score).toBe(85);
    expect(json.data.status).toBe("valid");
    expect(json.meta.creditsUsed).toBe(1);

    // Verify lastUsedAt was updated on the API key
    expect(mockPrisma.apiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "key-1" },
        data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
      }),
    );
  });

  // --------------------------------------------------------------------------
  // Test 2 — API key too short (< 8 chars) → anonymous fallback
  // --------------------------------------------------------------------------
  it("should fall back to anonymous when API key is shorter than 8 characters", async () => {
    const req = await createRequest("abc");
    const response = await GET(req);

    expect(response.status).toBe(200);
    const json = await response.json();
    // Anonymous path: quick checks with score 50 for passing disposable
    expect(json.meta.creditsUsed).toBe(0);
    expect(json.data.score).toBe(50);

    // DB lookup should not have been attempted for a trivially short key
    expect(mockPrisma.apiKey.findFirst).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Test 3 — API key not found in DB → anonymous fallback
  // --------------------------------------------------------------------------
  it("should fall back to anonymous when API key is not found in database", async () => {
    const req = await createRequest(API_KEY_VALUE);
    const response = await GET(req);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.meta.creditsUsed).toBe(0);
    expect(json.data.score).toBe(50);

    // findFirst was called but returned null
    expect(mockPrisma.apiKey.findFirst).toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Test 4 — Legacy hash migration on access
  // --------------------------------------------------------------------------
  it("should migrate legacy hash when keyHash matches legacyHash, then succeed", async () => {
    const legacyRecord = {
      ...validKeyRecord,
      keyHash: "legacy-hashed-key-value", // equals legacyHash output
    };
    mockPrisma.apiKey.findFirst.mockResolvedValue(legacyRecord);

    const req = await createRequest(API_KEY_VALUE);
    const response = await GET(req);

    expect(response.status).toBe(200);

    // Migration update: keyHash changed to new hash
    expect(mockPrisma.apiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "key-1" },
        data: { keyHash: "hashed-key-value" },
      }),
    );

    // lastUsedAt update also happened
    expect(mockPrisma.apiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "key-1" },
        data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
      }),
    );

    // Exactly 2 calls: migration + lastUsedAt
    expect(mockPrisma.apiKey.update).toHaveBeenCalledTimes(2);
  });

  // --------------------------------------------------------------------------
  // Test 5 — Inactive API key → anonymous fallback
  // --------------------------------------------------------------------------
  it("should fall back to anonymous when API key is inactive", async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue({
      ...validKeyRecord,
      isActive: false,
    });

    const req = await createRequest(API_KEY_VALUE);
    const response = await GET(req);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.meta.creditsUsed).toBe(0);
    expect(json.data.score).toBe(50);
  });

  // --------------------------------------------------------------------------
  // Test 6 — Inactive user account → anonymous fallback
  // --------------------------------------------------------------------------
  it("should fall back to anonymous when the key owner's account is inactive", async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue({
      ...validKeyRecord,
      user: { ...validKeyRecord.user, isActive: false },
    });

    const req = await createRequest(API_KEY_VALUE);
    const response = await GET(req);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.meta.creditsUsed).toBe(0);
    expect(json.data.score).toBe(50);
  });

  // --------------------------------------------------------------------------
  // Test 7 — Scope check fails → anonymous fallback
  // --------------------------------------------------------------------------
  it("should fall back to anonymous when API key lacks the validate scope", async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue(validKeyRecord);
    mockHasScope.mockReturnValue(false);

    const req = await createRequest(API_KEY_VALUE);
    const response = await GET(req);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.meta.creditsUsed).toBe(0);
    expect(json.data.score).toBe(50);
  });

  // --------------------------------------------------------------------------
  // Test 8 — Orphaned key (no user) → anonymous fallback
  // --------------------------------------------------------------------------
  it("should fall back to anonymous when API key record has no associated user", async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue({
      ...validKeyRecord,
      user: null,
    });

    const req = await createRequest(API_KEY_VALUE);
    const response = await GET(req);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.meta.creditsUsed).toBe(0);
    expect(json.data.score).toBe(50);
  });
});
