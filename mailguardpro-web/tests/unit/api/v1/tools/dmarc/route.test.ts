import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockResolveTxt, mockCheckRateLimit, mockGetClientIp, mockLoggerApi } = vi.hoisted(() => ({
  mockResolveTxt: vi.fn(),
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
  default: { resolveTxt: mockResolveTxt, resolveMx: vi.fn(), resolve: vi.fn() },
  resolveTxt: mockResolveTxt,
  resolveMx: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock("@/lib/redis", () => ({ checkRateLimit: mockCheckRateLimit, redis: {} }));
vi.mock("@/lib/ssrf", () => ({ getClientIp: mockGetClientIp }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn() },
  loggerApi: mockLoggerApi,
  loggerWebhook: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from "@/app/api/v1/tools/dmarc/route";

const BASE = "http://localhost/api/v1/tools/dmarc";

describe("GET /api/v1/tools/dmarc (P1/P0 SSRF)", () => {
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
    const res = await GET(get("8.8.8.8"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("IP addresses not allowed");
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockReturnValue({ success: false, resetAt: Date.now() + 1000 });
    const res = await GET(get("example.com"));
    expect(res.status).toBe(429);
  });

  it("returns hasDmarc true when a DMARC record is present", async () => {
    mockResolveTxt.mockResolvedValue([["v=DMARC1; p=reject; rua=mailto:dm@e.com"]]);
    const res = await GET(get("example.com"));
    const body = await res.json();
    expect(body.data.hasDmarc).toBe(true);
    expect(body.data.dmarcRecord).toContain("v=DMARC1");
  });

  it("returns hasDmarc false when no DMARC record exists", async () => {
    mockResolveTxt.mockResolvedValue([["some unrelated txt"]]);
    const res = await GET(get("example.com"));
    const body = await res.json();
    expect(body.data.hasDmarc).toBe(false);
    expect(body.data.dmarcRecord).toBeNull();
  });

  it("captures DNS resolution errors without failing", async () => {
    mockResolveTxt.mockRejectedValue(new Error("ENOTFOUND"));
    const res = await GET(get("example.com"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.error).toContain("ENOTFOUND");
  });
});
