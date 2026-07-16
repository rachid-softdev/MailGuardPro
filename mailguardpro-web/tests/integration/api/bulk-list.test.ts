import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/v1/bulk/route";

const mockAuth = vi.hoisted(() => vi.fn());
const mockFindMany = vi.hoisted(() => vi.fn());
const mockCount = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({
  prisma: { bulkJob: { findMany: mockFindMany, count: mockCount } },
}));

const URL = "http://localhost:3000/api/v1/bulk";

function req(query = "") {
  return new NextRequest(query ? `${URL}?${query}` : URL, { method: "GET" });
}

describe("GET /api/v1/bulk — list jobs route envelope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockFindMany.mockResolvedValue([
      { id: "j1", filename: "a.csv", status: "COMPLETED", totalEmails: 5, processed: 5 },
      { id: "j2", filename: "b.csv", status: "PROCESSING", totalEmails: 3, processed: 1 },
    ]);
    mockCount.mockResolvedValue(2);
  });

  // P1: 401
  it("should return 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  // P1: 400 invalid query — limit=0
  it("should return 400 for limit below minimum", async () => {
    const res = await GET(req("limit=0"));
    expect(res.status).toBe(400);
  });

  // P1: 400 invalid query — offset negative
  it("should return 400 for negative offset", async () => {
    const res = await GET(req("offset=-1"));
    expect(res.status).toBe(400);
  });

  // P1: 400 invalid query — non-numeric limit
  it("should return 400 for non-numeric limit", async () => {
    const res = await GET(req("limit=abc"));
    expect(res.status).toBe(400);
  });

  // P2: returns only the caller's jobs + pagination meta
  it("should list only the caller's jobs with meta", async () => {
    const res = await GET(req("limit=10&offset=0"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.meta).toEqual({ total: 2, limit: 10, offset: 0 });
    // Must scope the query to the authenticated user
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } }),
    );
    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } }),
    );
  });
});
