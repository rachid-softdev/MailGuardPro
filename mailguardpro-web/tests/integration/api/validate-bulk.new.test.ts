import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/v1/validate/bulk/route";

const mockAuth = vi.hoisted(() => vi.fn());
const mockCsrf = vi.hoisted(() => vi.fn(() => ({ valid: true })));
const mockRateLimit = vi.hoisted(() => vi.fn());
const mockProcess = vi.hoisted(() => vi.fn());
const mockUserFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: mockCsrf }));
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/rateLimits", () => ({ checkRateLimitByPlan: mockRateLimit }));
vi.mock("@/services/bulkProcessor", () => ({ processBulkUpload: mockProcess }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mockUserFindUnique } },
}));

const URL = "http://localhost:3000/api/v1/validate/bulk";

function csvRequest(content: string, filename = "test.csv", type = "text/csv") {
  const fd = new FormData();
  fd.append("file", new File([content], filename, { type }));
  return new NextRequest(URL, { method: "POST", body: fd });
}

const successRate = { success: true, limit: 1, remaining: 1, resetAt: Date.now() + 3600000 };

describe("POST /api/v1/validate/bulk — route envelope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCsrf.mockReturnValue({ valid: true });
    mockAuth.mockResolvedValue({ user: { id: "user-1", plan: "FREE" } });
    mockRateLimit.mockResolvedValue(successRate);
    mockUserFindUnique.mockResolvedValue({ credits: 100, plan: "FREE" });
    mockProcess.mockResolvedValue({ success: true, jobId: "job-xyz", totalEmails: 2 });
  });

  // P0: 401 unauthenticated
  it("should return 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(csvRequest("email\na@b.com"));
    expect(res.status).toBe(401);
  });

  // P0: 403 CSRF invalid
  it("should return 403 when CSRF check fails", async () => {
    mockCsrf.mockReturnValue({ valid: false, error: "Missing Origin" });
    const res = await POST(csvRequest("email\na@b.com"));
    expect(res.status).toBe(403);
  });

  // P0: 400 no file
  it("should return 400 when no file is provided", async () => {
    const fd = new FormData();
    const req = new NextRequest(URL, { method: "POST", body: fd });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  // P0: 400 non-CSV file
  it("should return 400 for a non-CSV file", async () => {
    const res = await POST(csvRequest("a,b,c", "data.txt", "text/plain"));
    expect(res.status).toBe(400);
  });

  // P0: 400 when processor reports failure
  it("should return 400 when processBulkUpload reports failure", async () => {
    mockProcess.mockResolvedValue({ success: false, errors: ["No valid emails found in file"] });
    const res = await POST(csvRequest("notanemail"));
    expect(res.status).toBe(400);
  });

  // P0: 200 success
  it("should return 200 with jobId on success", async () => {
    const res = await POST(csvRequest("email\na@b.com\nc@d.com"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.jobId).toBe("job-xyz");
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  // P1: 429 rate limit
  it("should return 429 when rate limited", async () => {
    mockRateLimit.mockResolvedValue({ success: false, limit: 1, resetAt: Date.now() + 1000 });
    const res = await POST(csvRequest("email\na@b.com"));
    expect(res.status).toBe(429);
  });

  // P1: 500 when processor throws
  it("should return 500 when processBulkUpload throws", async () => {
    mockProcess.mockRejectedValue(new Error("kaboom"));
    const res = await POST(csvRequest("email\na@b.com"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });
});
