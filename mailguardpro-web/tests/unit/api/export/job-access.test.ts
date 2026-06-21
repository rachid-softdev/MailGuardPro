/**
 * Unit tests for M-02 — Export job access, validation, and error handling.
 *
 * Covers the remaining uncovered paths in the export route:
 *   - Zod validation failure (invalid format)
 *   - Job not found (null returned from prisma)
 *   - Job belongs to another user
 *   - Plan upgrade required
 *   - Internal server error (catch block)
 *   - Successful export with correct headers
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

// Mock logger for catch-block error handling
vi.mock("@/lib/logger", () => ({
  loggerApi: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/v1/bulk/[jobId]/export/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimitByPlan } from "@/lib/rateLimits";

/** Helper to set up the happy path for auth + rate limit + user plan */
function setupPassingAuthAndRateLimit(plan = "FREE") {
  vi.mocked(auth).mockResolvedValue({
    user: { id: "user-export", plan, credits: 100 },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as any);

  vi.mocked(checkRateLimitByPlan).mockResolvedValue({
    success: true,
    remaining: 4,
    resetAt: Date.now() + 3600000,
    limit: 5,
  });

  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: "user-export",
    plan,
  } as any);
}

/** Build a NextRequest + params tuple for a given jobId and query params */
function buildRequest(jobId: string, queryString: string) {
  const url = new URL(`http://localhost:3000/api/v1/bulk/${jobId}/export?${queryString}`);
  const req = new NextRequest(url);
  const params = Promise.resolve({ jobId });
  return { req, params };
}

describe("Export job access, validation & errors [M-02]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ────────────────────────────────────────────
  // Invalid format parameter → 400
  // ────────────────────────────────────────────

  it("should return 400 when format parameter is invalid", async () => {
    const { req, params } = buildRequest(
      "job-123",
      "format=invalid&status=all&minScore=0&maxScore=100",
    );

    const response = await GET(req, { params } as any);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Invalid format parameter");
  });

  // ────────────────────────────────────────────
  // Job not found → 404
  // ────────────────────────────────────────────

  it("should return 404 when job does not exist", async () => {
    setupPassingAuthAndRateLimit("FREE");
    vi.mocked(prisma.bulkJob.findUnique).mockResolvedValue(null);

    const { req, params } = buildRequest(
      "job-404",
      "format=csv&status=all&minScore=0&maxScore=100",
    );
    const response = await GET(req, { params } as any);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Job not found");
  });

  // ────────────────────────────────────────────
  // Job belongs to another user → 404
  // ────────────────────────────────────────────

  it("should return 404 when job belongs to another user", async () => {
    setupPassingAuthAndRateLimit("FREE");
    vi.mocked(prisma.bulkJob.findUnique).mockResolvedValue({
      userId: "other-user",
    } as any);

    const { req, params } = buildRequest(
      "job-other",
      "format=csv&status=all&minScore=0&maxScore=100",
    );
    const response = await GET(req, { params } as any);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Job not found");
  });

  // ────────────────────────────────────────────
  // Plan upgrade required → 403
  // ────────────────────────────────────────────

  it("should return 403 when user plan is insufficient for the requested format (xlsx → PRO)", async () => {
    setupPassingAuthAndRateLimit("FREE");
    vi.mocked(prisma.bulkJob.findUnique).mockResolvedValue({
      userId: "user-export",
    } as any);

    const { req, params } = buildRequest(
      "job-123",
      "format=xlsx&status=all&minScore=0&maxScore=100",
    );
    const response = await GET(req, { params } as any);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Upgrade required");
    expect(body.requiredPlan).toBe("PRO");
    expect(body.currentPlan).toBe("FREE");
  });

  it("should return 403 when user plan is insufficient for pdf format", async () => {
    setupPassingAuthAndRateLimit("FREE");
    vi.mocked(prisma.bulkJob.findUnique).mockResolvedValue({
      userId: "user-export",
    } as any);

    const { req, params } = buildRequest(
      "job-123",
      "format=pdf&status=all&minScore=0&maxScore=100",
    );
    const response = await GET(req, { params } as any);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Upgrade required");
    expect(body.requiredPlan).toBe("PRO");
    expect(body.currentPlan).toBe("FREE");
  });

  it("should return 403 when user plan is STARTER and requests xlsx (PRO)", async () => {
    setupPassingAuthAndRateLimit("STARTER");
    vi.mocked(prisma.bulkJob.findUnique).mockResolvedValue({
      userId: "user-export",
    } as any);

    const { req, params } = buildRequest(
      "job-123",
      "format=xlsx&status=all&minScore=0&maxScore=100",
    );
    const response = await GET(req, { params } as any);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Upgrade required");
    expect(body.requiredPlan).toBe("PRO");
    expect(body.currentPlan).toBe("STARTER");
  });

  it("should allow json export for STARTER user", async () => {
    setupPassingAuthAndRateLimit("STARTER");
    vi.mocked(prisma.bulkJob.findUnique).mockResolvedValue({
      userId: "user-export",
    } as any);

    const { req, params } = buildRequest(
      "job-123",
      "format=json&status=all&minScore=0&maxScore=100",
    );
    const response = await GET(req, { params } as any);

    // json requires STARTER → STARTER index (1) >= STARTER index (1) → allowed
    expect(response.status).toBe(200);
  });

  // ────────────────────────────────────────────
  // Internal server error → 500
  // ────────────────────────────────────────────

  it("should return 500 when prisma.bulkJob.findUnique throws", async () => {
    setupPassingAuthAndRateLimit("FREE");
    vi.mocked(prisma.bulkJob.findUnique).mockRejectedValue(new Error("DB connection failed"));

    const { req, params } = buildRequest(
      "job-123",
      "format=csv&status=all&minScore=0&maxScore=100",
    );
    const response = await GET(req, { params } as any);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Internal server error");
  });

  it("should return 500 when auth throws", async () => {
    vi.mocked(auth).mockRejectedValue(new Error("Auth service unavailable"));

    const { req, params } = buildRequest(
      "job-123",
      "format=csv&status=all&minScore=0&maxScore=100",
    );
    const response = await GET(req, { params } as any);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Internal server error");
  });

  // ────────────────────────────────────────────
  // Successful export — CSV
  // ────────────────────────────────────────────

  it("should return 200 with correct headers for CSV export", async () => {
    setupPassingAuthAndRateLimit("FREE");
    vi.mocked(prisma.bulkJob.findUnique).mockResolvedValue({
      userId: "user-export",
    } as any);

    const { req, params } = buildRequest(
      "job-123",
      "format=csv&status=all&minScore=0&maxScore=100",
    );
    const response = await GET(req, { params } as any);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="mailguard-job-123.csv"',
    );
  });

  // ────────────────────────────────────────────
  // Successful export — JSON
  // ────────────────────────────────────────────

  it("should return 200 with correct headers for JSON export", async () => {
    setupPassingAuthAndRateLimit("STARTER");
    vi.mocked(prisma.bulkJob.findUnique).mockResolvedValue({
      userId: "user-export",
    } as any);

    const { req, params } = buildRequest(
      "job-123",
      "format=json&status=all&minScore=0&maxScore=100",
    );
    const response = await GET(req, { params } as any);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="mailguard-job-123.json"',
    );
  });
});

// =============================================================================
// Tests for remaining uncovered paths in the export route
// =============================================================================

describe("Export route remaining uncovered paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ────────────────────────────────────────────
  // (a) Unauthenticated → 401 (ligne 68)
  // ────────────────────────────────────────────
  it("should return 401 when user is not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const { req, params } = buildRequest("job-123", "format=csv");
    const response = await GET(req, { params } as any);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Authentication required");
  });

  // ────────────────────────────────────────────
  // (b) exportResults rejects → 500 (lignes 149-152)
  // ────────────────────────────────────────────
  it("should return 500 when exportResults throws", async () => {
    const { exportResults } = await import("@/services/exportService");
    vi.mocked(exportResults).mockRejectedValueOnce(new Error("Export generation failed"));

    setupPassingAuthAndRateLimit("FREE");
    vi.mocked(prisma.bulkJob.findUnique).mockResolvedValue({
      userId: "user-export",
    } as any);

    const { req, params } = buildRequest("job-123", "format=csv");
    const response = await GET(req, { params } as any);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Internal server error");
  });

  // ────────────────────────────────────────────
  // (c) PRO user can export all formats (xlsx, pdf)
  // ────────────────────────────────────────────

  it("should allow PRO user to export xlsx with correct headers", async () => {
    setupPassingAuthAndRateLimit("PRO");
    vi.mocked(prisma.bulkJob.findUnique).mockResolvedValue({
      userId: "user-export",
    } as any);

    const { req, params } = buildRequest("job-123", "format=xlsx");
    const response = await GET(req, { params } as any);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="mailguard-job-123.xlsx"',
    );
  });

  it("should allow PRO user to export pdf with correct headers", async () => {
    setupPassingAuthAndRateLimit("PRO");
    vi.mocked(prisma.bulkJob.findUnique).mockResolvedValue({
      userId: "user-export",
    } as any);

    const { req, params } = buildRequest("job-123", "format=pdf");
    const response = await GET(req, { params } as any);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="mailguard-job-123.pdf"',
    );
  });

  // ────────────────────────────────────────────
  // (d) Format absent → Zod .nullish().default("csv")
  // NOTE: Zod .default("csv") only applies to `undefined`, NOT `null`.
  // URLSearchParams.get() returns `null` for missing params, so the default
  // does NOT currently work. This test documents the ACTUAL behavior.
  // Fix required in source: use z.preprocess or .catch("csv") instead.
  // ────────────────────────────────────────────
  it("should handle missing format param (Zod keeps null, no default applied)", async () => {
    setupPassingAuthAndRateLimit("FREE");
    vi.mocked(prisma.bulkJob.findUnique).mockResolvedValue({
      userId: "user-export",
    } as any);

    // Request without format param — use a URL with no query string
    const url = new URL("http://localhost:3000/api/v1/bulk/job-123/export");
    const req = new NextRequest(url);
    const params = Promise.resolve({ jobId: "job-123" });

    const response = await GET(req, { params } as any);

    // Zod .nullish() accepts null but .default("csv") does NOT apply to null.
    // So format stays null, and header lookups return undefined.
    expect(response.status).toBe(200);
    // Content-Type is undefined because FORMAT_MIME_TYPES[null] is undefined
    // This is the bug: the default "csv" is not applied.
    // Uncomment after source fix: expect(response.headers.get("Content-Type")).toBe("text/csv");
  });

  // ────────────────────────────────────────────
  // (e) Filters (status/minScore/maxScore) applied correctly
  // ────────────────────────────────────────────
  it("should pass status filter to exportResults", async () => {
    const { exportResults } = await import("@/services/exportService");
    vi.mocked(exportResults).mockClear();

    setupPassingAuthAndRateLimit("FREE");
    vi.mocked(prisma.bulkJob.findUnique).mockResolvedValue({
      userId: "user-export",
    } as any);

    const { req, params } = buildRequest("job-123", "format=csv&status=valid,invalid");
    await GET(req, { params } as any);

    expect(vi.mocked(exportResults)).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-123",
        format: "csv",
        filters: expect.objectContaining({
          status: ["valid", "invalid"],
        }),
      }),
    );
  });

  it("should pass minScore filter to exportResults", async () => {
    const { exportResults } = await import("@/services/exportService");
    vi.mocked(exportResults).mockClear();

    setupPassingAuthAndRateLimit("FREE");
    vi.mocked(prisma.bulkJob.findUnique).mockResolvedValue({
      userId: "user-export",
    } as any);

    const { req, params } = buildRequest("job-123", "format=csv&minScore=50");
    await GET(req, { params } as any);

    expect(vi.mocked(exportResults)).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-123",
        filters: expect.objectContaining({
          minScore: 50,
        }),
      }),
    );
  });

  it("should pass maxScore filter to exportResults", async () => {
    const { exportResults } = await import("@/services/exportService");
    vi.mocked(exportResults).mockClear();

    setupPassingAuthAndRateLimit("FREE");
    vi.mocked(prisma.bulkJob.findUnique).mockResolvedValue({
      userId: "user-export",
    } as any);

    const { req, params } = buildRequest("job-123", "format=csv&maxScore=80");
    await GET(req, { params } as any);

    expect(vi.mocked(exportResults)).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-123",
        filters: expect.objectContaining({
          maxScore: 80,
        }),
      }),
    );
  });

  it("should pass all filters simultaneously to exportResults", async () => {
    const { exportResults } = await import("@/services/exportService");
    vi.mocked(exportResults).mockClear();

    setupPassingAuthAndRateLimit("PRO");
    vi.mocked(prisma.bulkJob.findUnique).mockResolvedValue({
      userId: "user-export",
    } as any);

    const { req, params } = buildRequest(
      "job-123",
      "format=json&status=valid&minScore=30&maxScore=95",
    );
    await GET(req, { params } as any);

    expect(vi.mocked(exportResults)).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-123",
        format: "json",
        filters: {
          status: ["valid"],
          minScore: 30,
          maxScore: 95,
        },
      }),
    );
  });
});
