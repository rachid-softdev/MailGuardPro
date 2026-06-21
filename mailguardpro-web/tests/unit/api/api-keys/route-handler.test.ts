/**
 * Unit tests for app/api/v1/api-keys/route.ts — GET and POST handlers.
 *
 * Covers:
 *   GET  /api/v1/api-keys — List API keys for authenticated user
 *   POST /api/v1/api-keys — Create a new API key with CSRF, auth, rate limit,
 *                            validation, max-keys, and audit-logging
 */

import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks (module-level, hoisted before all imports)
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/crypto", () => ({
  hashApiKey: vi.fn(),
}));

vi.mock("@/services/auditLogger", () => ({
  logAudit: vi.fn(),
  AuditAction: {
    API_KEY_CREATED: "API_KEY_CREATED",
    API_KEY_REVOKED: "API_KEY_REVOKED",
  },
  AuditResource: {
    API_KEY: "ApiKey",
  },
}));

vi.mock("@/lib/request", () => ({
  parseJsonBody: vi.fn(),
}));

vi.mock("@/lib/rateLimits", () => ({
  checkRateLimitByPlan: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  loggerApi: { error: vi.fn() },
}));

vi.mock("@/lib/ssrf", () => ({
  getClientIp: vi.fn(() => "8.8.8.8"),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { GET, POST } from "@/app/api/v1/api-keys/route";
import { auth } from "@/lib/auth";
import { hashApiKey } from "@/lib/crypto";
import { validateCsrfOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { checkRateLimitByPlan } from "@/lib/rateLimits";
import { parseJsonBody } from "@/lib/request";
import { logAudit } from "@/services/auditLogger";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a GET NextRequest */
function getRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/v1/api-keys", {
    method: "GET",
    headers: { origin: "http://localhost:3000" },
  });
}

/** Build a POST NextRequest (body is irrelevant because parseJsonBody is mocked) */
function postRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/v1/api-keys", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify({ name: "Test Key", scope: "full" }),
  });
}

/** Shared mock user session */
const mockSession = {
  user: { id: "user-1", plan: "FREE" },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

/** Shared created-at date */
const createdAtDate = new Date("2025-06-01T12:00:00Z");

/** Sample API keys returned from the DB */
const sampleKeys = [
  {
    id: "key-1",
    keyPrefix: "mg_live_abc1",
    name: "Production Key",
    scopes: "full",
    isActive: true,
    lastUsedAt: new Date("2025-06-15T10:00:00Z"),
    createdAt: createdAtDate,
  },
  {
    id: "key-2",
    keyPrefix: "mg_live_def2",
    name: "Staging Key",
    scopes: "read",
    isActive: true,
    lastUsedAt: null,
    createdAt: createdAtDate,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/api-keys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const response = await GET(getRequest());

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Authentication required");
  });

  it("should return empty array when user has no API keys", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue([]);

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it("should return list of API keys with correct fields", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue(sampleKeys);

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);

    const first = body.data[0];
    expect(first).toHaveProperty("id", "key-1");
    expect(first).toHaveProperty("keyPrefix", "mg_live_abc1");
    expect(first).toHaveProperty("name", "Production Key");
    expect(first).toHaveProperty("scopes", "full");
    expect(first).toHaveProperty("isActive", true);
    expect(first).toHaveProperty("lastUsedAt");
    expect(first).toHaveProperty("createdAt");
    // Must NOT expose the full key
    expect(first).not.toHaveProperty("key");
    expect(first).not.toHaveProperty("keyHash");
  });

  it("should return keys ordered by createdAt desc", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue(sampleKeys);

    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    expect(prisma.apiKey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("should only query keys belonging to the authenticated user", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue([]);

    await GET(getRequest());

    expect(prisma.apiKey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
      }),
    );
  });

  it("should return 500 when Prisma throws an error", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(prisma.apiKey.findMany).mockRejectedValue(new Error("DB connection failed"));

    const response = await GET(getRequest());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Internal server error");
  });
});

describe("POST /api/v1/api-keys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks for success path
    vi.mocked(validateCsrfOrigin).mockReturnValue({ valid: true });
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(checkRateLimitByPlan).mockResolvedValue({
      success: true,
      remaining: 1,
      resetAt: 9999999999,
      limit: 2,
    });
    vi.mocked(parseJsonBody).mockResolvedValue({
      data: { name: "Test Key", scope: "full" },
    });
    vi.mocked(hashApiKey).mockReturnValue("mocked-hash-value");
    vi.mocked(prisma.apiKey.count).mockResolvedValue(0);
    vi.mocked(prisma.apiKey.create).mockResolvedValue({
      id: "new-key-1",
      keyPrefix: "mg_live_abc1",
      keyHash: "mocked-hash-value",
      name: "Test Key",
      scopes: "full",
      isActive: true,
      createdAt: createdAtDate,
      userId: "user-1",
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Authentication & CSRF ──────────────────────────────────

  it("should return 403 when CSRF validation fails", async () => {
    vi.mocked(validateCsrfOrigin).mockReturnValueOnce({
      valid: false,
      error: "Origin not allowed",
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Origin not allowed");
    // Should NOT proceed to auth or DB
    expect(auth).not.toHaveBeenCalled();
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("should return 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as any);

    const response = await POST(postRequest());

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Authentication required");
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
  });

  // ── Rate limiting ──────────────────────────────────────────

  it("should return 429 when rate limit exceeded", async () => {
    vi.mocked(checkRateLimitByPlan).mockResolvedValueOnce({
      success: false,
      remaining: 0,
      resetAt: 9999999999,
      limit: 2,
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Rate limit exceeded");
    expect(body).toHaveProperty("retryAfter");
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("should check rate limit against the user's plan for apiKeys action", async () => {
    await POST(postRequest());

    expect(checkRateLimitByPlan).toHaveBeenCalledWith("user-1", "FREE", "apiKeys");
  });

  // ── Input validation — name ────────────────────────────────

  it("should return 400 when name is missing", async () => {
    vi.mocked(parseJsonBody).mockResolvedValueOnce({
      data: { scope: "full" },
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Name is required");
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("should return 400 when name is empty string", async () => {
    vi.mocked(parseJsonBody).mockResolvedValueOnce({
      data: { name: "", scope: "full" },
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Name is required");
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("should return 400 when name is only whitespace", async () => {
    vi.mocked(parseJsonBody).mockResolvedValueOnce({
      data: { name: "   ", scope: "full" },
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Name is required");
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("should return 400 when name exceeds 50 characters", async () => {
    vi.mocked(parseJsonBody).mockResolvedValueOnce({
      data: { name: "A".repeat(51), scope: "full" },
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Name must be less than 50 characters");
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("should accept name exactly 50 characters", async () => {
    const name50 = "A".repeat(50);
    vi.mocked(parseJsonBody).mockResolvedValueOnce({
      data: { name: name50, scope: "full" },
    });
    vi.mocked(prisma.apiKey.create).mockResolvedValueOnce({
      id: "new-key-2",
      keyPrefix: "mg_live_xyz9",
      keyHash: "mocked-hash",
      name: name50,
      scopes: "full",
      isActive: true,
      createdAt: createdAtDate,
      userId: "user-1",
    } as any);

    const response = await POST(postRequest());

    expect(response.status).toBe(201);
    // Should trim, but 50 chars with no whitespace is fine
    expect(prisma.apiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: name50 }),
      }),
    );
  });

  // ── Input validation — scope ───────────────────────────────

  it("should return 400 when scope is invalid", async () => {
    vi.mocked(parseJsonBody).mockResolvedValueOnce({
      data: { name: "Test Key", scope: "invalid_scope" },
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Invalid scope");
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("should accept 'full' as valid scope", async () => {
    vi.mocked(parseJsonBody).mockResolvedValueOnce({
      data: { name: "Test Key", scope: "full" },
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(201);
  });

  it("should accept 'read' as valid scope", async () => {
    vi.mocked(parseJsonBody).mockResolvedValueOnce({
      data: { name: "Test Key", scope: "read" },
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(201);
  });

  it("should accept 'validate' as valid scope", async () => {
    vi.mocked(parseJsonBody).mockResolvedValueOnce({
      data: { name: "Test Key", scope: "validate" },
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(201);
  });

  it("should accept 'export' as valid scope", async () => {
    vi.mocked(parseJsonBody).mockResolvedValueOnce({
      data: { name: "Test Key", scope: "export" },
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(201);
  });

  it("should default to 'full' scope when scope is not provided", async () => {
    vi.mocked(parseJsonBody).mockResolvedValueOnce({
      data: { name: "Test Key" },
    });

    await POST(postRequest());

    expect(prisma.apiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ scopes: "full" }),
      }),
    );
  });

  // ── Max keys limit ─────────────────────────────────────────

  it("should return 400 when user already has 10 keys", async () => {
    vi.mocked(prisma.apiKey.count).mockResolvedValueOnce(10);

    const response = await POST(postRequest());

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Maximum 10 API keys allowed");
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("should allow creation when user has 9 keys (below limit)", async () => {
    vi.mocked(prisma.apiKey.count).mockResolvedValueOnce(9);

    const response = await POST(postRequest());

    expect(response.status).toBe(201);
  });

  // ── Key generation & storage ───────────────────────────────

  it("should generate a key starting with mg_live_", async () => {
    await POST(postRequest());

    // hashApiKey is called with the generated key — capture it
    const hashCall = vi.mocked(hashApiKey).mock.calls[0][0];
    expect(hashCall).toMatch(/^mg_live_/);
  });

  it("should call hashApiKey to store hashed key", async () => {
    await POST(postRequest());

    expect(hashApiKey).toHaveBeenCalledTimes(1);
    expect(prisma.apiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          keyHash: "mocked-hash-value",
        }),
      }),
    );
  });

  it("should store keyPrefix (first 12 chars) in the database", async () => {
    vi.mocked(hashApiKey).mockImplementationOnce((key: string) => {
      // use the actual key to derive the prefix
      return "mocked-hash";
    });

    await POST(postRequest());

    // The keyPrefix is derived from the generated key: key.substring(0, 12)
    const createCall = vi.mocked(prisma.apiKey.create).mock.calls[0][0];
    expect(createCall.data).toHaveProperty("keyPrefix");
    expect(typeof createCall.data.keyPrefix).toBe("string");
    expect(createCall.data.keyPrefix.length).toBe(12);
  });

  it("should store trimmed name", async () => {
    vi.mocked(parseJsonBody).mockResolvedValueOnce({
      data: { name: "  My Key  ", scope: "full" },
    });

    await POST(postRequest());

    expect(prisma.apiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "My Key" }),
      }),
    );
  });

  it("should store the user id on the key", async () => {
    await POST(postRequest());

    expect(prisma.apiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1" }),
      }),
    );
  });

  // ── Success response ───────────────────────────────────────

  it("should return 201 with full key only once on successful creation", async () => {
    vi.mocked(prisma.apiKey.create).mockResolvedValueOnce({
      id: "new-key-success",
      keyPrefix: "mg_live_abc1",
      keyHash: "mocked-hash-value",
      name: "Test Key",
      scopes: "full",
      isActive: true,
      createdAt: createdAtDate,
      userId: "user-1",
    } as any);

    const response = await POST(postRequest());

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id", "new-key-success");
    // Full key is returned exactly once (in the response)
    expect(body.data).toHaveProperty("key");
    expect(typeof body.data.key).toBe("string");
    expect(body.data.key).toMatch(/^mg_live_/);
    // Must NOT expose keyHash
    expect(body.data).not.toHaveProperty("keyHash");
    // Key prefix should also be present
    expect(body.data).toHaveProperty("keyPrefix", "mg_live_abc1");
    expect(body.data).toHaveProperty("name", "Test Key");
    expect(body.data).toHaveProperty("scopes", "full");
    expect(body.data).toHaveProperty("isActive", true);
    expect(body.data).toHaveProperty("createdAt");
  });

  // ── Audit logging ──────────────────────────────────────────

  it("should call audit logger on successful creation", async () => {
    vi.mocked(prisma.apiKey.create).mockResolvedValueOnce({
      id: "new-key-audit",
      keyPrefix: "mg_live_aud1",
      keyHash: "mocked-hash",
      name: "Test Key",
      scopes: "full",
      isActive: true,
      createdAt: createdAtDate,
      userId: "user-1",
    } as any);

    await POST(postRequest());

    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        action: "API_KEY_CREATED",
        resource: "ApiKey",
        resourceId: "new-key-audit",
        metadata: expect.objectContaining({ keyName: "Test Key" }),
      }),
    );
  });

  // ── Error handling ─────────────────────────────────────────

  it("should return 500 when parseJsonBody fails with error response", async () => {
    const errorResponse = NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 },
    );
    vi.mocked(parseJsonBody).mockResolvedValueOnce({
      error: errorResponse,
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Invalid JSON");
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("should return 500 when Prisma create throws an error", async () => {
    vi.mocked(prisma.apiKey.create).mockRejectedValueOnce(new Error("DB constraint violation"));

    const response = await POST(postRequest());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Internal server error");
  });

  it("should return 500 when Prisma count throws an error", async () => {
    vi.mocked(prisma.apiKey.count).mockRejectedValueOnce(new Error("DB connection error"));

    const response = await POST(postRequest());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Internal server error");
  });
});
