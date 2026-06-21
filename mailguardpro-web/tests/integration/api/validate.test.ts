import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/v1/validate/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Mock dependencies
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/crypto", () => ({
  hashApiKey: vi.fn((key: string) => `hash-${key}`),
  hashApiKeyLegacy: vi.fn((key: string) => `legacy-${key}`),
}));

vi.mock("@/lib/auth/require-scope", () => ({
  hasScope: vi.fn(() => true),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findUnique: vi.fn(() => Promise.resolve(null)),
      findFirst: vi.fn(() => Promise.resolve(null)),
      update: vi.fn(() => Promise.resolve({})),
    },
    user: {
      findUnique: vi.fn(() => Promise.resolve({ credits: 100, plan: "FREE" })),
    },
    validation: {
      create: vi.fn(() => Promise.resolve({})),
    },
  },
}));

vi.mock("@/lib/redis", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ success: true, resetAt: new Date() })),
}));

vi.mock("@/services/emailValidator", () => ({
  validateEmail: vi.fn(() =>
    Promise.resolve({
      email: "test@example.com",
      score: 85,
      status: "valid",
      checks: {},
      domain: {},
      processingTimeMs: 100,
    }),
  ),
}));

vi.mock("@/services/disposableChecker", () => ({
  checkDisposable: vi.fn(() =>
    Promise.resolve({ passed: true, message: "Not disposable", detail: "" }),
  ),
}));

vi.mock("@/services/formatChecker", () => ({
  checkFormat: vi.fn(() => ({ passed: true, message: "Valid format" })),
}));

describe("/api/v1/validate", () => {
  describe("GET", () => {
    it("should return 400 for missing email parameter", async () => {
      const url = new URL("http://localhost:3000/api/v1/validate");
      const req = new NextRequest(url);

      const response = await GET(req);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.success).toBe(false);
    });

    it("should return 400 for invalid email format", async () => {
      const url = new URL("http://localhost:3000/api/v1/validate");
      url.searchParams.set("email", "invalid-email");
      const req = new NextRequest(url);

      const response = await GET(req);

      expect(response.status).toBe(400);
    });

    it("should return validation result for valid email", async () => {
      const url = new URL("http://localhost:3000/api/v1/validate");
      url.searchParams.set("email", "test@example.com");
      const req = new NextRequest(url);

      const response = await GET(req);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty("score");
      expect(json.data).toHaveProperty("status");
    });

    it("should return 429 when rate limit exceeded", async () => {
      // Mock rate limit to return failure
      const { checkRateLimit } = await import("@/lib/redis");
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        success: false,
        remaining: 0,
        resetAt: Date.now(),
        limit: 100,
      });

      const url = new URL("http://localhost:3000/api/v1/validate");
      url.searchParams.set("email", "test@example.com");
      const req = new NextRequest(url);

      const response = await GET(req);

      expect(response.status).toBe(429);
    });

    it("should include processing time in response for anonymous users", async () => {
      const url = new URL("http://localhost:3000/api/v1/validate");
      url.searchParams.set("email", "test@example.com");
      const req = new NextRequest(url);

      const response = await GET(req);

      const json = await response.json();
      // Anonymous users get a simplified response — processingTimeMs is in data, not meta
      expect(json.data).toHaveProperty("processingTimeMs");
      expect(json.data.checks).toHaveProperty("format");
      expect(json.meta).toHaveProperty("requestId");
    });

    it("should handle valid email with all checks", async () => {
      const url = new URL("http://localhost:3000/api/v1/validate");
      url.searchParams.set("email", "john.doe@company.com");
      const req = new NextRequest(url);

      const response = await GET(req);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data.checks).toBeDefined();
    });

    // --------------------------------------------------------------------------
    // Anonymous path: format check failure
    // --------------------------------------------------------------------------
    it("should return score 0 / status invalid when anonymous format check fails", async () => {
      const { checkFormat } = await import("@/services/formatChecker");
      vi.mocked(checkFormat).mockReturnValueOnce({
        passed: false,
        message: "Invalid email format",
      });

      const url = new URL("http://localhost:3000/api/v1/validate");
      url.searchParams.set("email", "test@example.com");
      const req = new NextRequest(url);
      const response = await GET(req);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data.score).toBe(0);
      expect(json.data.status).toBe("invalid");
      expect(json.meta.creditsUsed).toBe(0);
      expect(json.data.checks).toHaveProperty("format");
      expect(json.data.checks.format.passed).toBe(false);
    });

    // --------------------------------------------------------------------------
    // Anonymous path: disposable check failure (format passes)
    // --------------------------------------------------------------------------
    it("should return score 0 / status invalid when anonymous disposable check fails", async () => {
      const { checkDisposable } = await import("@/services/disposableChecker");
      vi.mocked(checkDisposable).mockResolvedValueOnce({
        passed: false,
        message: "Disposable email",
        detail: "tempmail.com is a disposable domain",
        provider: "builtin-list",
      });

      const url = new URL("http://localhost:3000/api/v1/validate");
      url.searchParams.set("email", "test@tempmail.com");
      const req = new NextRequest(url);
      const response = await GET(req);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data.score).toBe(0);
      expect(json.data.status).toBe("invalid");
      expect(json.meta.creditsUsed).toBe(0);
      expect(json.data.checks).toHaveProperty("disposable");
      expect(json.data.checks.disposable.passed).toBe(false);
    });

    // --------------------------------------------------------------------------
    // Anonymous path: format + disposable both pass returns score 50
    // --------------------------------------------------------------------------
    it("should return score 50 / status unknown when anonymous checks both pass", async () => {
      const url = new URL("http://localhost:3000/api/v1/validate");
      url.searchParams.set("email", "test@example.com");
      const req = new NextRequest(url);
      const response = await GET(req);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data.score).toBe(50);
      expect(json.data.status).toBe("unknown");
      expect(json.meta.creditsUsed).toBe(0);
      expect(json.meta).toHaveProperty("note", "Full validation requires authentication");
    });
  });
});

// =============================================================================
// Tests for getAuthenticatedUser — edge cases (VF-14 coverage)
// =============================================================================

describe("getAuthenticatedUser edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // (a) API key avec scope invalide → traité comme anonyme (lignes 68-69)
  // --------------------------------------------------------------------------
  it("should treat API key with invalid scope as anonymous", async () => {
    const { hasScope } = await import("@/lib/auth/require-scope");
    vi.mocked(hasScope).mockReturnValueOnce(false);

    vi.mocked(prisma.apiKey.findFirst).mockResolvedValueOnce({
      id: "key-scope-1",
      keyHash: "hash-test-key",
      isActive: true,
      scopes: "read",
      user: { id: "user-1", isActive: true, plan: "FREE", credits: 100 },
    } as any);

    const url = new URL("http://localhost:3000/api/v1/validate");
    url.searchParams.set("email", "test@example.com");
    const req = new NextRequest(url, {
      headers: { "X-API-Key": "test-key-123" },
    });

    const response = await GET(req);
    expect(response.status).toBe(200);
    const json = await response.json();

    // Should fall through to anonymous path
    expect(json.meta.creditsUsed).toBe(0);
    expect(json.meta).toHaveProperty("note", "Full validation requires authentication");
    expect(json.data.score).toBe(50);
  });

  // --------------------------------------------------------------------------
  // (b) Utilisateur inactif (isActive === false via dbUser) → anonyme (lignes 39-40)
  // --------------------------------------------------------------------------
  it("should treat inactive session user as anonymous", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "user-inactive" },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      isActive: false,
    } as any);

    const url = new URL("http://localhost:3000/api/v1/validate");
    url.searchParams.set("email", "test@example.com");
    const req = new NextRequest(url);

    const response = await GET(req);
    expect(response.status).toBe(200);
    const json = await response.json();

    // Should fall through to anonymous path
    expect(json.meta.creditsUsed).toBe(0);
    expect(json.meta).toHaveProperty("note", "Full validation requires authentication");
    expect(json.data.score).toBe(50);
  });

  // --------------------------------------------------------------------------
  // (c) API key orpheline (keyRecord.user est null) → anonyme (ligne 65)
  // --------------------------------------------------------------------------
  it("should treat orphaned API key (user deleted) as anonymous", async () => {
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValueOnce({
      id: "key-orphan-1",
      keyHash: "hash-test-key",
      isActive: true,
      scopes: "full",
      user: null,
    } as any);

    const url = new URL("http://localhost:3000/api/v1/validate");
    url.searchParams.set("email", "test@example.com");
    const req = new NextRequest(url, {
      headers: { "X-API-Key": "test-key-123" },
    });

    const response = await GET(req);
    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.meta.creditsUsed).toBe(0);
    expect(json.meta).toHaveProperty("note", "Full validation requires authentication");
  });

  // --------------------------------------------------------------------------
  // (d) API key trop courte (< 8 caractères) → anonyme immédiatement (ligne 47)
  // --------------------------------------------------------------------------
  it("should reject API key shorter than 8 chars and treat as anonymous", async () => {
    const url = new URL("http://localhost:3000/api/v1/validate");
    url.searchParams.set("email", "test@example.com");
    const req = new NextRequest(url, {
      headers: { "X-API-Key": "short" }, // 5 chars < 8
    });

    const response = await GET(req);
    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.meta.creditsUsed).toBe(0);

    // apiKey.findFirst should NOT have been called (short-circuit before DB)
    expect(prisma.apiKey.findFirst).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // (e) Migration de hash legacy (lignes 57-62)
  // --------------------------------------------------------------------------
  it("should migrate legacy hash when API key matches legacy hash", async () => {
    // Use crypto mock to return different hash values
    const { hashApiKey, hashApiKeyLegacy } = await import("@/lib/crypto");
    vi.mocked(hashApiKey).mockReturnValue("new-hash-value");
    vi.mocked(hashApiKeyLegacy).mockReturnValue("legacy-hash-value");

    // findFirst matches on legacy hash (OR condition)
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValueOnce({
      id: "key-legacy-1",
      keyHash: "legacy-hash-value", // stored as legacy hash
      isActive: true,
      scopes: "full",
      user: { id: "user-1", isActive: true, plan: "PRO", credits: 500 },
    } as any);

    // Stop at format gate to avoid full credit path
    const { checkFormat } = await import("@/services/formatChecker");
    vi.mocked(checkFormat).mockReturnValueOnce({ passed: false, message: "Bad format" });

    const url = new URL("http://localhost:3000/api/v1/validate");
    url.searchParams.set("email", "test@example.com");
    const req = new NextRequest(url, {
      headers: { "X-API-Key": "any-key-value" },
    });

    await GET(req);

    // The migration update should have been called before scope check
    expect(prisma.apiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "key-legacy-1" },
        data: { keyHash: "new-hash-value" },
      }),
    );
  });

  // --------------------------------------------------------------------------
  // (i) Ligne 315: code mort — pour utilisateur anonyme, validateEmail n'est JAMAIS appelé
  // --------------------------------------------------------------------------
  it("should prove line 315 is dead code — validateEmail never called for anonymous", async () => {
    const { validateEmail } = await import("@/services/emailValidator");
    vi.mocked(validateEmail).mockClear();

    const url = new URL("http://localhost:3000/api/v1/validate");
    url.searchParams.set("email", "test@example.com");
    const req = new NextRequest(url);

    const response = await GET(req);
    expect(response.status).toBe(200);

    // validateEmail is NEVER called for anonymous users because:
    // - Line 101: if (!user) returns early with anonymous response
    // - Line 315 (the else branch) is therefore never reached
    expect(validateEmail).not.toHaveBeenCalled();
  });
});
