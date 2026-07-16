/**
 * Additional unit tests for lib/cronAuth.ts
 * - Rate-limit sequence (1st ok, 2nd 429)
 * - Empty / whitespace Authorization header
 * - Wrong-case (lowercase "bearer") Authorization header
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/timingSafe", () => ({
  timingSafeEqual: vi.fn((a: string, b: string) => a === b),
}));

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

const { mockRedis } = vi.hoisted(() => {
  const redis = {
    set: vi.fn().mockResolvedValue("OK"),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
  };
  return { mockRedis: redis };
});

vi.mock("@/lib/redis", () => ({
  redis: mockRedis,
  default: mockRedis,
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

import { verifyCronRequest } from "@/lib/cronAuth";

describe("verifyCronRequest — extra coverage", () => {
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
    if (authHeader !== undefined) {
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

  it("should rate-limit the 2nd request within the 5-min window (sequence)", async () => {
    mockRedis.set
      .mockResolvedValueOnce("OK") // 1st: SET NX EX succeeds
      .mockResolvedValueOnce(null); // 2nd: key exists → rate limited

    const req1 = createMockRequest("Bearer test-cron-secret-value");
    const res1 = await verifyCronRequest(req1 as any, "seq-job");
    expect(res1.authorized).toBe(true);

    const req2 = createMockRequest("Bearer test-cron-secret-value");
    const res2 = await verifyCronRequest(req2 as any, "seq-job");
    expect(res2.authorized).toBe(false);
    expect(res2.response?.status).toBe(429);
    const body = await res2.response?.json();
    expect(body?.error).toBe("Too many requests");
  });

  it("should reject an empty Authorization header", async () => {
    const req = createMockRequest("");
    const result = await verifyCronRequest(req as any, "cleanup");
    expect(result.authorized).toBe(false);
    expect(result.response?.status).toBe(401);
  });

  it("should reject a whitespace-only Authorization header", async () => {
    const req = createMockRequest("   ");
    const result = await verifyCronRequest(req as any, "cleanup");
    expect(result.authorized).toBe(false);
    expect(result.response?.status).toBe(401);
  });

  it("should reject a lowercase 'bearer' prefix (case-sensitive comparison)", async () => {
    const req = createMockRequest("bearer test-cron-secret-value");
    const result = await verifyCronRequest(req as any, "cleanup");
    expect(result.authorized).toBe(false);
    expect(result.response?.status).toBe(401);
  });
});
