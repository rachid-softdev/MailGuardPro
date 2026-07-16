import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/v1/bulk/[jobId]/export-data/route";

const mockAuth = vi.hoisted(() => vi.fn());
const mockJobFindFirst = vi.hoisted(() => vi.fn());
const mockValidationFindMany = vi.hoisted(() => vi.fn());
const mockUserFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    bulkJob: { findFirst: mockJobFindFirst },
    validation: { findMany: mockValidationFindMany },
    user: { findUnique: mockUserFindUnique },
  },
}));

const BASE = "http://localhost:3000/api/v1/bulk/job-123/export-data";

function req() {
  return new NextRequest(BASE, { method: "GET" });
}

function mixedResults() {
  return [
    {
      email: "valid@x.com",
      score: 90,
      status: "valid",
      checksJson: {
        smtp: { passed: true },
        disposable: { passed: true },
        format: { passed: true },
      },
    },
    {
      email: "invalid@x.com",
      score: 10,
      status: "invalid",
      checksJson: {
        smtp: { passed: false },
        disposable: { passed: true },
        format: { passed: false },
      },
    },
    {
      email: "risky@x.com",
      score: 55,
      status: "risky",
      checksJson: {
        smtp: { passed: false },
        disposable: { passed: true },
        format: { passed: true },
      },
    },
    {
      email: "unknown@x.com",
      score: 5,
      status: "unknown",
      checksJson: {},
    },
  ];
}

describe("GET /api/v1/bulk/[jobId]/export-data — route envelope & stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockJobFindFirst.mockResolvedValue({ id: "job-123", filename: "t.csv" });
    // Default: PRO plan so the pre-existing stats tests still pass (200).
    mockUserFindUnique.mockResolvedValue({ plan: "PRO" });
  });

  // P1: 401
  it("should return 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req(), { params: Promise.resolve({ jobId: "job-123" }) });
    expect(res.status).toBe(401);
  });

  // P0: 404 ownership
  it("should return 404 when the job is not owned by the caller", async () => {
    mockJobFindFirst.mockResolvedValue(null);
    const res = await GET(req(), { params: Promise.resolve({ jobId: "job-123" }) });
    expect(res.status).toBe(404);
    expect(mockValidationFindMany).not.toHaveBeenCalled();
  });

  // P2: malformed / unknown jobId → 404
  it("should return 404 for an unknown jobId", async () => {
    mockJobFindFirst.mockResolvedValue(null);
    const res = await GET(req(), { params: Promise.resolve({ jobId: "nope" }) });
    expect(res.status).toBe(404);
  });

  // P1: stats correctness
  it("should compute correct stats from mixed results", async () => {
    mockValidationFindMany.mockResolvedValue(mixedResults());
    const res = await GET(req(), { params: Promise.resolve({ jobId: "job-123" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    const { stats, recommendations, highRiskEmails, meta } = body.data;
    expect(stats.valid).toBe(1);
    expect(stats.invalid).toBe(1);
    expect(stats.risky).toBe(1);
    expect(stats.unknown).toBe(1);
    expect(stats.avgScore).toBe(40); // round((90+10+55+5)/4)
    expect(stats.deliverabilityRate).toBe(25); // round(1/4*100)

    // recommendations should have no nulls and include the invalid/risky/disposable notes
    expect(Array.isArray(recommendations)).toBe(true);
    expect(recommendations).not.toContain(null);
    expect(recommendations.length).toBe(3);

    // high-risk = score < 40 → the invalid(10) and unknown(5) rows
    expect(highRiskEmails).toHaveLength(2);
    expect(highRiskEmails.every((r: any) => r.score < 40)).toBe(true);
    expect(meta.totalEmails).toBe(4);
  });

  // P1: empty job → zeros
  it("should return all-zero stats for an empty job", async () => {
    mockValidationFindMany.mockResolvedValue([]);
    const res = await GET(req(), { params: Promise.resolve({ jobId: "job-123" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    const { stats, recommendations, highRiskEmails } = body.data;
    expect(stats.valid).toBe(0);
    expect(stats.invalid).toBe(0);
    expect(stats.risky).toBe(0);
    expect(stats.unknown).toBe(0);
    expect(stats.avgScore).toBe(0);
    expect(stats.deliverabilityRate).toBe(0);
    expect(highRiskEmails).toEqual([]);
    expect(recommendations).toEqual([]);
  });

  // ================================================================
  // REGRESSION #5: PDF plan-gating must be enforced server-side.
  // /export-data feeds client-side PDF generation, a PRO+ feature.
  // A user whose plan is below PRO must get 403; PRO/BUSINESS get 200.
  // ================================================================
  describe("regression #5 — PRO+ plan gate enforced server-side", () => {
    it("FREE user → 403 Upgrade required", async () => {
      mockUserFindUnique.mockResolvedValue({ plan: "FREE" });
      const res = await GET(req(), { params: Promise.resolve({ jobId: "job-123" }) });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.requiredPlan).toBe("PRO");
      expect(body.currentPlan).toBe("FREE");
      // Data must NOT be fetched for gated users
      expect(mockValidationFindMany).not.toHaveBeenCalled();
    });

    it("STARTER user → 403 Upgrade required", async () => {
      mockUserFindUnique.mockResolvedValue({ plan: "STARTER" });
      const res = await GET(req(), { params: Promise.resolve({ jobId: "job-123" }) });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.requiredPlan).toBe("PRO");
      expect(body.currentPlan).toBe("STARTER");
    });

    it("PRO user (owned job) → 200 with data", async () => {
      mockUserFindUnique.mockResolvedValue({ plan: "PRO" });
      mockValidationFindMany.mockResolvedValue(mixedResults());
      const res = await GET(req(), { params: Promise.resolve({ jobId: "job-123" }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.meta.totalEmails).toBe(4);
    });

    it("BUSINESS user (owned job) → 200 with data", async () => {
      mockUserFindUnique.mockResolvedValue({ plan: "BUSINESS" });
      mockValidationFindMany.mockResolvedValue(mixedResults());
      const res = await GET(req(), { params: Promise.resolve({ jobId: "job-123" }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.meta.totalEmails).toBe(4);
    });
  });
});
