/**
 * Unit tests for M-02 — Export rate limit.
 *
 * Verifies that the export route returns 429 when the rate limit is exceeded
 * and allows the request when within limits.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock next/server to control URL handling for query params
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Mocks (module-level, hoisted before imports)
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/rateLimits", () => ({
  checkRateLimitByPlan: vi.fn(),
  Plan: { FREE: "FREE", STARTER: "STARTER", PRO: "PRO", BUSINESS: "BUSINESS" },
  RateLimitExceededError: class extends Error {
    constructor(
      public limit: number,
      public windowSeconds: number,
      public resetAt: number,
    ) {
      super("Rate limit exceeded");
      this.name = "RateLimitExceededError";
    }
  },
  getPlanLimits: vi.fn(() => ({
    export: { requests: 5, window: 3600 },
    bulkSize: 10000,
  })),
  PLAN_LIMITS: {
    FREE: { export: { requests: 5, window: 3600 }, bulkSize: 10000 },
    STARTER: { export: { requests: 20, window: 3600 }, bulkSize: 10000 },
    PRO: { export: { requests: 100, window: 3600 }, bulkSize: 100000 },
    BUSINESS: { export: { requests: 999999, window: 3600 }, bulkSize: 1000000 },
  },
}));

// Mock exportService to prevent heavy module imports (csv-stringify, exceljs)
vi.mock("@/services/exportService", () => ({
  exportResults: vi.fn().mockResolvedValue(Buffer.from("mock-export-data")),
}));

// Mock prisma for the "within limit" test path
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    bulkJob: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  },
}));

import { GET } from "@/app/api/v1/bulk/[jobId]/export/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimitByPlan } from "@/lib/rateLimits";
import { NextRequest } from "next/server";

describe("Export rate limit [M-02]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ────────────────────────────────────────────
  // Rate limit exceeded → 429
  // ────────────────────────────────────────────

  it("should return 429 when rate limit exceeded", async () => {
    // Mock auth to return a session
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-export", plan: "FREE", credits: 100 },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as any);

    // Mock rate limit to fail
    vi.mocked(checkRateLimitByPlan).mockResolvedValue({
      success: false,
      remaining: 0,
      resetAt: Date.now() + 3600000,
      limit: 5,
    });

    // NOTE: Must provide all query params because zod schema rejects null
    // for optional fields (searchParams.get returns null for missing params).
    // This is a known issue in the production route code.
    const url = new URL(
      "http://localhost:3000/api/v1/bulk/job-123/export?format=csv&status=all&minScore=0&maxScore=100",
    );
    const req = new NextRequest(url);
    const params = Promise.resolve({ jobId: "job-123" });
    const response = await GET(req, { params } as any);

    expect(response.status).toBe(429);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Rate limit exceeded");
    expect(body).toHaveProperty("retryAfter");
  });

  it("should include retryAfter in the 429 response", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-export", plan: "FREE", credits: 100 },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as any);

    const futureReset = Date.now() + 3600000;
    vi.mocked(checkRateLimitByPlan).mockResolvedValue({
      success: false,
      remaining: 0,
      resetAt: futureReset,
      limit: 5,
    });

    const url = new URL(
      "http://localhost:3000/api/v1/bulk/job-123/export?format=csv&status=all&minScore=0&maxScore=100",
    );
    const req = new NextRequest(url);
    const params = Promise.resolve({ jobId: "job-123" });
    const response = await GET(req, { params } as any);

    const body = await response.json();
    expect(body.retryAfter).toBe(futureReset);
  });

  // ────────────────────────────────────────────
  // Within rate limit → 200 (or continues processing)
  // ────────────────────────────────────────────

  it("should allow request when within rate limit and proceed to auth check", async () => {
    // Mock rate limit to succeed
    vi.mocked(checkRateLimitByPlan).mockResolvedValue({
      success: true,
      remaining: 4,
      resetAt: Date.now() + 3600000,
      limit: 5,
    });

    // Mock auth to return a session
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-export", plan: "FREE", credits: 100 },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as any);

    // Mock prisma to return user with plan and job belonging to user
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-export",
      plan: "FREE",
    } as any);

    vi.mocked(prisma.bulkJob.findUnique).mockResolvedValue({
      userId: "user-export",
    } as any);

    const url = new URL(
      "http://localhost:3000/api/v1/bulk/job-123/export?format=csv&status=all&minScore=0&maxScore=100",
    );
    const req = new NextRequest(url);
    const params = Promise.resolve({ jobId: "job-123" });
    const response = await GET(req, { params } as any);

    // Should get 200 since everything is set up for success (export returns buffer)
    expect(response.status).toBe(200);
  });
});
