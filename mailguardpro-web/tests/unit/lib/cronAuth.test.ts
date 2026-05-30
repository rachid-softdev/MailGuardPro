/**
 * Unit tests for lib/cronAuth.ts
 *
 * Tests:
 * - verifyCronRequest with valid/invalid CRON_SECRET
 * - Rate limiting via Redis SET NX EX 300
 * - Error handling when CRON_SECRET is not configured
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock timingSafe before imports
vi.mock("@/lib/timingSafe", () => ({
  timingSafeEqual: vi.fn((a: string, b: string) => a === b),
}));

// Mock NextRequest/NextResponse
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
  return { NextRequest: class {}, NextResponse };
});

// Use vi.hoisted to create mock before imports
const { mockRedis } = vi.hoisted(() => {
  const redis = {
    set: vi.fn().mockResolvedValue("OK"),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
  };
  return { mockRedis: redis };
});

// Mock @/lib/redis
vi.mock("@/lib/redis", () => ({
  redis: mockRedis,
  default: mockRedis,
}));

// Mock @sentry/nextjs
vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

import { verifyCronRequest } from "@/lib/cronAuth";

describe("verifyCronRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "test-cron-secret-value");
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function createMockRequest(authHeader?: string): any {
    const headers: Record<string, string> = {
      "x-forwarded-for": "127.0.0.1",
    };
    if (authHeader) {
      headers["authorization"] = authHeader;
    }
    return {
      headers: {
        get: (name: string) => headers[name.toLowerCase()] || null,
      },
      method: "GET",
      nextUrl: { pathname: "/api/cron/cleanup" },
    };
  }

  it("should return authorized with valid CRON_SECRET and within rate limit", async () => {
    mockRedis.set.mockResolvedValue("OK"); // SET NX EX succeeds
    const req = createMockRequest("Bearer test-cron-secret-value");

    const result = await verifyCronRequest(req as any, "cleanup");

    expect(result.authorized).toBe(true);
    expect(result.response).toBeUndefined();
  });

  it("should return unauthorized with invalid CRON_SECRET", async () => {
    const req = createMockRequest("Bearer wrong-secret");

    const result = await verifyCronRequest(req as any, "cleanup");

    expect(result.authorized).toBe(false);
    expect(result.response?.status).toBe(401);
    const body = await result.response?.json();
    expect(body?.error).toBe("Unauthorized");
  });

  it("should return unauthorized when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const req = createMockRequest("Bearer anything");

    const result = await verifyCronRequest(req as any, "cleanup");

    expect(result.authorized).toBe(false);
    expect(result.response?.status).toBe(500);
    const body = await result.response?.json();
    expect(body?.error).toBe("Server configuration error");
  });

  it("should return 429 when rate limited (Redis SET returns null)", async () => {
    mockRedis.set.mockResolvedValue(null); // SET NX EX fails → rate limited
    const req = createMockRequest("Bearer test-cron-secret-value");

    const result = await verifyCronRequest(req as any, "cleanup");

    expect(result.authorized).toBe(false);
    expect(result.response?.status).toBe(429);
    const body = await result.response?.json();
    expect(body?.error).toBe("Too many requests");
  });

  it("should allow request if Redis is unavailable (fail-open for cron)", async () => {
    mockRedis.set.mockRejectedValue(new Error("Redis connection refused"));
    const req = createMockRequest("Bearer test-cron-secret-value");

    const result = await verifyCronRequest(req as any, "cleanup");

    // Cron is better than no cron, so allow if Redis is down
    expect(result.authorized).toBe(true);
  });

  it("should use correct Redis key format with endpoint name", async () => {
    mockRedis.set.mockResolvedValue("OK");
    const req = createMockRequest("Bearer test-cron-secret-value");

    await verifyCronRequest(req as any, "my-cron-job");

    expect(mockRedis.set).toHaveBeenCalledWith("cron:ratelimit:my-cron-job", "1", "NX", "EX", 300);
  });

  it("should reject request with missing Authorization header", async () => {
    const req = createMockRequest(); // no auth header

    const result = await verifyCronRequest(req as any, "cleanup");

    expect(result.authorized).toBe(false);
    expect(result.response?.status).toBe(401);
  });

  it("should reject request with non-Bearer Authorization header", async () => {
    const req = createMockRequest("Basic some-token");

    const result = await verifyCronRequest(req as any, "cleanup");

    expect(result.authorized).toBe(false);
    expect(result.response?.status).toBe(401);
  });
});
