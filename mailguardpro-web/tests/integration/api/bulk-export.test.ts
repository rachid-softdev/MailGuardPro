import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/v1/bulk/[jobId]/export/route";

const mockAuth = vi.hoisted(() => vi.fn());
const mockRateLimit = vi.hoisted(() => vi.fn());
const mockUserFindUnique = vi.hoisted(() => vi.fn());
const mockJobFindUnique = vi.hoisted(() => vi.fn());
const mockExportResults = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/rateLimits", () => ({ checkRateLimitByPlan: mockRateLimit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    bulkJob: { findUnique: mockJobFindUnique },
  },
}));
vi.mock("@/services/exportService", () => ({ exportResults: mockExportResults }));

const BASE = "http://localhost:3000/api/v1/bulk/job-123/export";

function req(format = "csv", extra = "") {
  const q = `format=${format}${extra}`;
  return new NextRequest(`${BASE}?${q}`, { method: "GET" });
}

const successRate = { success: true, limit: 5, remaining: 5, resetAt: Date.now() + 3600000 };

describe("GET /api/v1/bulk/[jobId]/export — route envelope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-1", plan: "FREE" } });
    mockRateLimit.mockResolvedValue(successRate);
    mockUserFindUnique.mockResolvedValue({ plan: "FREE" });
    mockJobFindUnique.mockResolvedValue({ userId: "user-1" });
    mockExportResults.mockResolvedValue(Buffer.from("email,score\n"));
  });

  // P1: 401
  it("should return 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req(), { params: Promise.resolve({ jobId: "job-123" }) });
    expect(res.status).toBe(401);
  });

  // P1: 400 invalid format
  it("should return 400 for an unsupported format", async () => {
    const res = await GET(req("xml"), { params: Promise.resolve({ jobId: "job-123" }) });
    expect(res.status).toBe(400);
  });

  // P1: 429 rate limit
  it("should return 429 when export rate limited", async () => {
    mockRateLimit.mockResolvedValue({ success: false, limit: 5, resetAt: Date.now() + 1000 });
    const res = await GET(req(), { params: Promise.resolve({ jobId: "job-123" }) });
    expect(res.status).toBe(429);
  });

  // P0: plan gating — FREE cannot export json
  it("should return 403 when the plan does not allow the format (json for FREE)", async () => {
    const res = await GET(req("json"), { params: Promise.resolve({ jobId: "job-123" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.requiredPlan).toBe("STARTER");
  });

  // P0: plan gating — FREE cannot export xlsx
  it("should return 403 when the plan does not allow xlsx for FREE", async () => {
    const res = await GET(req("xlsx"), { params: Promise.resolve({ jobId: "job-123" }) });
    expect(res.status).toBe(403);
  });

  // P1: pdf is handled client-side — must not 500
  it("should return 400 (client-side PDF) instead of 500 for format=pdf", async () => {
    const res = await GET(req("pdf"), { params: Promise.resolve({ jobId: "job-123" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.useEndpoint).toContain("/export-data");
  });

  // P0: cross-user job → 404 (no existence leak)
  it("should return 404 for another user's job", async () => {
    mockJobFindUnique.mockResolvedValue({ userId: "other-user" });
    const res = await GET(req(), { params: Promise.resolve({ jobId: "job-123" }) });
    expect(res.status).toBe(404);
    expect(mockExportResults).not.toHaveBeenCalled();
  });

  // P2: malformed / unknown jobId → 404
  it("should return 404 for an unknown jobId", async () => {
    mockJobFindUnique.mockResolvedValue(null);
    const res = await GET(req(), { params: Promise.resolve({ jobId: "does-not-exist" }) });
    expect(res.status).toBe(404);
  });

  // P2: success returns file with correct headers
  it("should return the exported file with CSV content headers", async () => {
    const res = await GET(req(), { params: Promise.resolve({ jobId: "job-123" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("mailguard-job-123.csv");
  });
});
