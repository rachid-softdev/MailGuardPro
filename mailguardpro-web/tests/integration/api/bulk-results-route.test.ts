import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/v1/bulk/[jobId]/results/route";

const mockAuth = vi.hoisted(() => vi.fn());
const mockFindFirst = vi.hoisted(() => vi.fn());
const mockGetResults = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({
  prisma: { bulkJob: { findFirst: mockFindFirst } },
}));
vi.mock("@/services/bulkProcessor", () => ({ getBulkJobResults: mockGetResults }));

const BASE = "http://localhost:3000/api/v1/bulk/job-123/results";

function req(query = "page=1&limit=50") {
  return new NextRequest(`${BASE}?${query}`, { method: "GET" });
}

describe("GET /api/v1/bulk/[jobId]/results — route envelope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockFindFirst.mockResolvedValue({ id: "job-123" });
    mockGetResults.mockResolvedValue({
      results: [],
      total: 0,
      page: 1,
      limit: 50,
      totalPages: 0,
    });
  });

  // P1: 401
  it("should return 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req(), { params: Promise.resolve({ jobId: "job-123" }) });
    expect(res.status).toBe(401);
  });

  // P1: 400 invalid query (limit over max)
  it("should return 400 for invalid query params (limit=200)", async () => {
    const res = await GET(req("page=1&limit=200"), {
      params: Promise.resolve({ jobId: "job-123" }),
    });
    expect(res.status).toBe(400);
  });

  // P1: 400 invalid query (page=0)
  it("should return 400 for invalid query params (page=0)", async () => {
    const res = await GET(req("page=0&limit=50"), {
      params: Promise.resolve({ jobId: "job-123" }),
    });
    expect(res.status).toBe(400);
  });

  // P0: 404 ownership — other user's / unknown job
  it("should return 404 when the job is not owned by the caller", async () => {
    mockFindFirst.mockResolvedValue(null);
    const res = await GET(req(), { params: Promise.resolve({ jobId: "job-123" }) });
    expect(res.status).toBe(404);
    expect(mockGetResults).not.toHaveBeenCalled();
  });

  // P0: 200 success returns paginated data
  it("should return 200 with results for the owner", async () => {
    mockGetResults.mockResolvedValue({
      results: [{ id: "v1", email: "a@b.com", score: 90, status: "valid" }],
      total: 1,
      page: 1,
      limit: 50,
      totalPages: 1,
    });
    const res = await GET(req(), { params: Promise.resolve({ jobId: "job-123" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.results).toHaveLength(1);
  });

  // P2: minScore > maxScore still proceeds (empty result)
  it("should pass minScore/maxScore filters through even when inverted", async () => {
    const res = await GET(req("page=1&limit=50&minScore=80&maxScore=20"), {
      params: Promise.resolve({ jobId: "job-123" }),
    });
    expect(res.status).toBe(200);
    expect(mockGetResults).toHaveBeenCalledWith(
      "job-123",
      "user-1",
      1,
      50,
      expect.objectContaining({ minScore: 80, maxScore: 20 }),
    );
  });

  // P2: empty status="" becomes [""] filter (documented behavior)
  it("should forward an empty status filter as a single empty-string value", async () => {
    const res = await GET(req("page=1&limit=50&status="), {
      params: Promise.resolve({ jobId: "job-123" }),
    });
    expect(res.status).toBe(200);
    expect(mockGetResults).toHaveBeenCalledWith(
      "job-123",
      "user-1",
      1,
      50,
      expect.objectContaining({ status: [""] }),
    );
  });
});
