import { NextRequest } from "next/server";
/**
 * Integration tests for GET /api/v1/usage.
 *
 * Verifies the auth gate and plan-limit resolution for FREE and BUSINESS
 * (the latter being unlimited: -1), plus null-plan and empty-bulk fallbacks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve({ user: { id: "user-1" } })),
  handlers: { GET: vi.fn(), POST: vi.fn() },
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    validation: { count: vi.fn().mockResolvedValue(0) },
    bulkJob: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
  loggerApi: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/v1/usage/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function req() {
  return new NextRequest("http://localhost:3000/api/v1/usage", { method: "GET" });
}

describe("GET /api/v1/usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  // ── P0: unauthenticated ──
  it("should return 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Authentication required/i);
  });

  // ── P1: BUSINESS → unlimited (-1) ──
  it("should report unlimited credits/bulk for BUSINESS plan", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      plan: "BUSINESS",
      credits: 50,
      createdAt: new Date("2024-01-01"),
      _count: { validations: 0, bulkJobs: 0, apiKeys: 0, webhooks: 0 },
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.plan).toBe("BUSINESS");
    expect(body.data.credits.included).toBe(-1);
    expect(body.data.bulk.maxBatch).toBe(-1);
    expect(body.data.credits.remaining).toBe(50);
  });

  // ── P1: FREE → 100 credits, 0 bulk ──
  it("should report FREE plan limits (100 credits, 0 bulk)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      plan: "FREE",
      credits: 10,
      createdAt: new Date("2024-01-01"),
      _count: { validations: 0, bulkJobs: 0, apiKeys: 0, webhooks: 0 },
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.plan).toBe("FREE");
    expect(body.data.credits.included).toBe(100);
    expect(body.data.bulk.maxBatch).toBe(0);
    expect(body.data.credits.remaining).toBe(10);
  });

  // ── P2: null/unknown plan → defaults to FREE ──
  it("should default to FREE limits when plan is null", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      plan: null,
      credits: 5,
      createdAt: new Date("2024-01-01"),
      _count: { validations: 0, bulkJobs: 0, apiKeys: 0, webhooks: 0 },
    });
    const res = await GET(req());
    const body = await res.json();
    expect(body.data.plan).toBe("FREE");
    expect(body.data.credits.included).toBe(100);
  });

  // ── P2: no bulk jobs → totals 0 ──
  it("should report zero bulk totals when user has no bulk jobs", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      plan: "PRO",
      credits: 100,
      createdAt: new Date("2024-01-01"),
      _count: { validations: 0, bulkJobs: 0, apiKeys: 0, webhooks: 0 },
    });
    vi.mocked(prisma.bulkJob.findMany).mockResolvedValue([]);
    const res = await GET(req());
    const body = await res.json();
    expect(body.data.bulk.totalEmails).toBe(0);
    expect(body.data.bulk.totalProcessed).toBe(0);
  });
});
