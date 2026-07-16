/**
 * Integration tests for app/api/v1/api-keys/route.ts (GET list + POST create)
 * Covers CSRF, authentication, name/scope validation, key cap, ownership, and success.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rateLimits", () => ({
  checkRateLimitByPlan: vi
    .fn()
    .mockResolvedValue({ success: true, remaining: 99, resetAt: Date.now() + 60000 }),
}));

vi.mock("@/services/auditLogger", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  AuditAction: { API_KEY_CREATED: "API_KEY_CREATED" },
  AuditResource: { API_KEY: "ApiKey" },
}));

vi.mock("@/lib/logger", () => ({
  loggerApi: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/v1/api-keys/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SESSION = { user: { id: "owner-1", plan: "FREE" } };
const ORIGIN = "http://localhost:3000";

function makeReq(method: string, body?: unknown) {
  return new NextRequest(`https://mailguard.pro/api/v1/api-keys`, {
    method,
    headers: { origin: ORIGIN },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("POST /api/v1/api-keys", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 when CSRF origin/referer is missing", async () => {
    vi.mocked(auth).mockResolvedValue(SESSION as any);
    const req = new NextRequest("https://mailguard.pro/api/v1/api-keys", {
      method: "POST",
      body: JSON.stringify({ name: "Key" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await POST(makeReq("POST", { name: "Key" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is empty/whitespace", async () => {
    vi.mocked(auth).mockResolvedValue(SESSION as any);
    const res = await POST(makeReq("POST", { name: "   " }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Name is required");
  });

  it("returns 400 when name exceeds 50 characters", async () => {
    vi.mocked(auth).mockResolvedValue(SESSION as any);
    const res = await POST(makeReq("POST", { name: "x".repeat(51) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid scope", async () => {
    vi.mocked(auth).mockResolvedValue(SESSION as any);
    const res = await POST(makeReq("POST", { name: "Key", scope: "bogus" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid scope");
  });

  it("returns 400 when the user already has 10 keys", async () => {
    vi.mocked(auth).mockResolvedValue(SESSION as any);
    vi.mocked(prisma.apiKey.count).mockResolvedValue(10);
    const res = await POST(makeReq("POST", { name: "Key" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false });
  });

  it("returns 429 when the plan rate limit is exceeded", async () => {
    const { checkRateLimitByPlan } = await import("@/lib/rateLimits");
    vi.mocked(checkRateLimitByPlan).mockResolvedValueOnce({
      success: false,
      remaining: 0,
      resetAt: Date.now() + 60000,
    });
    vi.mocked(auth).mockResolvedValue(SESSION as any);
    vi.mocked(prisma.apiKey.count).mockResolvedValue(0);
    const res = await POST(makeReq("POST", { name: "Key" }));
    expect(res.status).toBe(429);
  });

  it("creates a key and returns 201 with the raw key once", async () => {
    vi.mocked(auth).mockResolvedValue(SESSION as any);
    vi.mocked(prisma.apiKey.count).mockResolvedValue(0);
    vi.mocked(prisma.apiKey.create).mockResolvedValue({
      id: "key-new",
      keyPrefix: "mg_live_abc",
      name: "My Key",
      scopes: "full",
      isActive: true,
      createdAt: new Date(),
    });
    const res = await POST(makeReq("POST", { name: "My Key" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.key).toBeDefined();
    expect(body.data.keyPrefix).toBe("mg_live_abc");
    expect(prisma.apiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "owner-1", name: "My Key" }),
      }),
    );
  });
});

describe("GET /api/v1/api-keys", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns only the owning user's keys (no cross-user leakage)", async () => {
    vi.mocked(auth).mockResolvedValue(SESSION as any);
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue([
      { id: "k1", keyPrefix: "mg_live_a", name: "A", scopes: "full", isActive: true },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(prisma.apiKey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "owner-1" } }),
    );
  });
});
