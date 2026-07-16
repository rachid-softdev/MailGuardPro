import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/v1/bulk/[jobId]/status/route";

const mockAuth = vi.hoisted(() => vi.fn());
const mockGetStatus = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/services/bulkProcessor", () => ({ getBulkJobStatus: mockGetStatus }));

const URL = "http://localhost:3000/api/v1/bulk/job-123/status";

function req(jobId = "job-123") {
  return new NextRequest(URL, { method: "GET" }); // params provided separately
}

describe("GET /api/v1/bulk/[jobId]/status — route envelope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
  });

  // P1: 401
  it("should return 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req(), { params: Promise.resolve({ jobId: "job-123" }) });
    expect(res.status).toBe(401);
  });

  // P0: 404 for unknown/non-owned job (was previously 500 — see source fix)
  it("should return 404 when the job is not found / not owned", async () => {
    mockGetStatus.mockRejectedValue(new Error("JOB_NOT_FOUND"));
    const res = await GET(req(), { params: Promise.resolve({ jobId: "nope" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Job not found");
  });

  // P0: 200 with computed percentage
  it("should return 200 with the job status and percentage", async () => {
    mockGetStatus.mockResolvedValue({
      id: "job-123",
      status: "PROCESSING",
      totalEmails: 100,
      processed: 40,
      percentage: 40,
      filename: "t.csv",
      createdAt: new Date(),
      startedAt: new Date(),
      completedAt: null,
    });
    const res = await GET(req(), { params: Promise.resolve({ jobId: "job-123" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("PROCESSING");
    expect(body.data.percentage).toBe(40);
  });

  // P1: 500 for unexpected errors
  it("should return 500 for unexpected errors", async () => {
    mockGetStatus.mockRejectedValue(new Error("db exploded"));
    const res = await GET(req(), { params: Promise.resolve({ jobId: "job-123" }) });
    expect(res.status).toBe(500);
  });
});
