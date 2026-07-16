import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockResolveMx, mockCheckRateLimit, mockGetClientIp, mockLoggerApi } = vi.hoisted(() => ({
  mockResolveMx: vi.fn(),
  mockCheckRateLimit: vi.fn(() => ({
    success: true,
    resetAt: Date.now() + 60000,
    remaining: 100,
    limit: 100,
  })),
  mockGetClientIp: vi.fn(() => "127.0.0.1"),
  mockLoggerApi: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("dns/promises", () => ({
  __esModule: true,
  default: { resolveTxt: vi.fn(), resolveMx: mockResolveMx, resolve: vi.fn() },
  resolveTxt: vi.fn(),
  resolveMx: mockResolveMx,
  resolve: vi.fn(),
}));
vi.mock("@/lib/redis", () => ({ checkRateLimit: mockCheckRateLimit, redis: {} }));
vi.mock("@/lib/ssrf", () => ({ getClientIp: mockGetClientIp }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn() },
  loggerApi: mockLoggerApi,
  loggerWebhook: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from "@/app/api/v1/tools/mx/route";

const BASE = "http://localhost/api/v1/tools/mx";

describe("GET /api/v1/tools/mx (P1/P0 SSRF)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockReturnValue({
      success: true,
      resetAt: Date.now() + 60000,
      remaining: 100,
      limit: 100,
    });
    mockGetClientIp.mockReturnValue("127.0.0.1");
  });

  const get = (domain?: string) =>
    new NextRequest(domain ? `${BASE}?domain=${encodeURIComponent(domain)}` : BASE);

  it("returns 400 when domain is missing", async () => {
    const res = await GET(get());
    expect(res.status).toBe(400);
  });

  it("returns 400 when domain is an IP literal (SSRF guard)", async () => {
    const res = await GET(get("9.9.9.9"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("IP addresses not allowed");
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockReturnValue({ success: false, resetAt: Date.now() + 1000 });
    const res = await GET(get("example.com"));
    expect(res.status).toBe(429);
  });

  it("returns sorted MX records and hasMx true", async () => {
    mockResolveMx.mockResolvedValue([
      { exchange: "mail2.example.com", priority: 20 },
      { exchange: "mail1.example.com", priority: 10 },
    ]);
    const res = await GET(get("example.com"));
    const body = await res.json();
    expect(body.data.hasMx).toBe(true);
    expect(body.data.mxRecords[0]).toEqual({ host: "mail1.example.com", priority: 10 });
    expect(body.data.mxRecords[1]).toEqual({ host: "mail2.example.com", priority: 20 });
  });

  it("returns hasMx false when no MX records exist", async () => {
    mockResolveMx.mockResolvedValue([]);
    const res = await GET(get("example.com"));
    const body = await res.json();
    expect(body.data.hasMx).toBe(false);
    expect(body.data.mxRecords).toEqual([]);
  });

  it("captures DNS resolution errors without failing", async () => {
    mockResolveMx.mockRejectedValue(new Error("ENOTFOUND"));
    const res = await GET(get("example.com"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.error).toContain("ENOTFOUND");
  });
});
