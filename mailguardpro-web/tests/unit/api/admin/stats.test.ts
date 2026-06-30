// ================================================================
// Unit tests for GET /api/v1/admin/stats
// ================================================================
// Covers authentication (inline, not requireAdmin), 9 parallel Prisma
// queries, error handling, and edge cases (null plan, null name/email,
// very large counts).
// ================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks (hoisted by vitest before all imports)
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  loggerApi: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      count: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    validation: {
      count: vi.fn(),
    },
    bulkJob: {
      count: vi.fn(),
    },
    webhook: {
      count: vi.fn(),
    },
    apiKey: {
      count: vi.fn(),
    },
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { GET as GetAdminStats } from "@/app/api/v1/admin/stats/route";
import { auth } from "@/lib/auth";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Helper: parse response JSON */
async function json(res: Response): Promise<unknown> {
  return res.json();
}

/** Create a base Request object for the stats endpoint */
function createRequest(): Request {
  return new Request("http://localhost/api/v1/admin/stats");
}

/** Mock a valid admin session (old scalar role format) */
function mockAdminSessionScalar(): void {
  vi.mocked(auth).mockResolvedValue({
    user: { id: "admin-1", role: "ADMIN" },
  });
}

/** Mock a valid admin session (new roles array format) */
function mockAdminSessionArray(): void {
  vi.mocked(auth).mockResolvedValue({
    user: { id: "admin-2", roles: ["ADMIN"] },
  });
}

/** Mock a non-admin session */
function mockUserSession(): void {
  vi.mocked(auth).mockResolvedValue({
    user: { id: "user-1", role: "USER" },
  });
}

/** Default mock data for all 9 Prisma queries */
function mockFullData(): void {
  vi.mocked(prisma.user.count).mockResolvedValueOnce(42); // totalUsers
  vi.mocked(prisma.user.count).mockResolvedValueOnce(30); // activeUsers
  vi.mocked(prisma.validation.count).mockResolvedValueOnce(1500); // totalValidations
  vi.mocked(prisma.validation.count).mockResolvedValueOnce(85); // validationsToday
  vi.mocked(prisma.bulkJob.count).mockResolvedValueOnce(12); // totalBulkJobs
  vi.mocked(prisma.webhook.count).mockResolvedValueOnce(5); // activeWebhooks
  vi.mocked(prisma.apiKey.count).mockResolvedValueOnce(23); // totalApiKeys
  vi.mocked(prisma.user.groupBy).mockResolvedValueOnce([
    { plan: "FREE", _count: { id: 20 } },
    { plan: "PRO", _count: { id: 15 } },
    { plan: "ENTERPRISE", _count: { id: 7 } },
  ]);
  vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
    {
      id: "u3",
      name: "Alice",
      email: "alice@example.com",
      plan: "PRO",
      isActive: true,
      createdAt: new Date("2026-06-28T12:00:00Z"),
    },
    {
      id: "u2",
      name: "Bob",
      email: "bob@example.com",
      plan: "FREE",
      isActive: true,
      createdAt: new Date("2026-06-27T12:00:00Z"),
    },
    {
      id: "u1",
      name: "Charlie",
      email: "charlie@example.com",
      plan: "ENTERPRISE",
      isActive: false,
      createdAt: new Date("2026-06-26T12:00:00Z"),
    },
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/admin/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===================================================================
  // Success cases
  // ===================================================================

  describe("success", () => {
    it("should return all stats with complete data", async () => {
      mockAdminSessionScalar();
      mockFullData();

      const res = await GetAdminStats(createRequest());
      const body: any = await json(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.totalUsers).toBe(42);
      expect(body.data.activeUsers).toBe(30);
      expect(body.data.totalValidations).toBe(1500);
      expect(body.data.validationsToday).toBe(85);
      expect(body.data.totalBulkJobs).toBe(12);
      expect(body.data.activeWebhooks).toBe(5);
      expect(body.data.totalApiKeys).toBe(23);

      // usersByPlan — mapped shape
      expect(body.data.usersByPlan).toEqual([
        { plan: "FREE", count: 20 },
        { plan: "PRO", count: 15 },
        { plan: "ENTERPRISE", count: 7 },
      ]);

      // recentUsers — mapped shape with Date → string serialization
      expect(body.data.recentUsers).toHaveLength(3);
      expect(body.data.recentUsers[0]).toEqual({
        id: "u3",
        name: "Alice",
        email: "alice@example.com",
        plan: "PRO",
        isActive: true,
        createdAt: "2026-06-28T12:00:00.000Z",
      });
      expect(body.data.recentUsers[1]).toEqual({
        id: "u2",
        name: "Bob",
        email: "bob@example.com",
        plan: "FREE",
        isActive: true,
        createdAt: "2026-06-27T12:00:00.000Z",
      });
    });

    it("should return empty stats when all tables are empty", async () => {
      mockAdminSessionScalar();

      vi.mocked(prisma.user.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.user.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.validation.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.validation.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.bulkJob.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.webhook.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.apiKey.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.user.groupBy).mockResolvedValueOnce([]);
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([]);

      const res = await GetAdminStats(createRequest());
      const body: any = await json(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.totalUsers).toBe(0);
      expect(body.data.activeUsers).toBe(0);
      expect(body.data.totalValidations).toBe(0);
      expect(body.data.validationsToday).toBe(0);
      expect(body.data.totalBulkJobs).toBe(0);
      expect(body.data.activeWebhooks).toBe(0);
      expect(body.data.totalApiKeys).toBe(0);
      expect(body.data.usersByPlan).toEqual([]);
      expect(body.data.recentUsers).toEqual([]);
    });

    it("should pass correct arguments to prisma queries", async () => {
      mockAdminSessionScalar();
      mockFullData();

      await GetAdminStats(createRequest());

      // totalUsers
      expect(vi.mocked(prisma.user.count)).toHaveBeenNthCalledWith(1);
      // activeUsers
      expect(vi.mocked(prisma.user.count)).toHaveBeenNthCalledWith(2, {
        where: { isActive: true },
      });
      // totalValidations
      expect(vi.mocked(prisma.validation.count)).toHaveBeenNthCalledWith(1);
      // validationsToday — must include gte filter with start-of-day date
      const validationCountCall = vi.mocked(prisma.validation.count).mock.calls[1]?.[0];
      expect(validationCountCall).toBeDefined();
      expect(validationCountCall).toHaveProperty("where.createdAt.gte");
      const gteDate = (validationCountCall as any).where.createdAt.gte;
      expect(gteDate).toBeInstanceOf(Date);
      // Should be today at 00:00:00.000
      const now = new Date();
      expect(gteDate.getFullYear()).toBe(now.getFullYear());
      expect(gteDate.getMonth()).toBe(now.getMonth());
      expect(gteDate.getDate()).toBe(now.getDate());
      expect(gteDate.getHours()).toBe(0);
      expect(gteDate.getMinutes()).toBe(0);
      expect(gteDate.getSeconds()).toBe(0);
      expect(gteDate.getMilliseconds()).toBe(0);

      // totalBulkJobs
      expect(vi.mocked(prisma.bulkJob.count)).toHaveBeenCalledWith();
      // activeWebhooks
      expect(vi.mocked(prisma.webhook.count)).toHaveBeenCalledWith({
        where: { isActive: true },
      });
      // totalApiKeys
      expect(vi.mocked(prisma.apiKey.count)).toHaveBeenCalledWith();
      // usersByPlan
      expect(vi.mocked(prisma.user.groupBy)).toHaveBeenCalledWith({
        by: ["plan"],
        _count: { id: true },
      });
      // recentUsers
      expect(vi.mocked(prisma.user.findMany)).toHaveBeenCalledWith({
        select: { id: true, name: true, email: true, plan: true, isActive: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
    });
  });

  // ===================================================================
  // Authentication — inline checks (not requireAdmin)
  // ===================================================================

  describe("authentication", () => {
    it("should return 401 when no session (auth returns null)", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      const res = await GetAdminStats(createRequest());
      const body: any = await json(res);

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Authentication required");
    });

    it("should return 401 when session has no user.id", async () => {
      vi.mocked(auth).mockResolvedValue({ user: {} } as any);

      const res = await GetAdminStats(createRequest());
      const body: any = await json(res);

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Authentication required");
    });

    it("should return 403 when user is not admin (role=USER)", async () => {
      mockUserSession();

      const res = await GetAdminStats(createRequest());
      const body: any = await json(res);

      expect(res.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Access denied. Admin role required.");
    });

    it("should allow access when user has admin role via old scalar format", async () => {
      mockAdminSessionScalar();
      mockFullData();

      const res = await GetAdminStats(createRequest());
      expect(res.status).toBe(200);
    });

    it("should allow access when user has admin role via new roles array format", async () => {
      mockAdminSessionArray();
      mockFullData();

      const res = await GetAdminStats(createRequest());
      expect(res.status).toBe(200);
    });

    it("should return 403 when user has non-admin roles array", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-1", roles: ["USER"] },
      });

      const res = await GetAdminStats(createRequest());
      const body: any = await json(res);

      expect(res.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Access denied. Admin role required.");
    });

    it("should not call any prisma query on auth failure", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      await GetAdminStats(createRequest());

      expect(vi.mocked(prisma.user.count)).not.toHaveBeenCalled();
      expect(vi.mocked(prisma.validation.count)).not.toHaveBeenCalled();
      expect(vi.mocked(prisma.bulkJob.count)).not.toHaveBeenCalled();
      expect(vi.mocked(prisma.webhook.count)).not.toHaveBeenCalled();
      expect(vi.mocked(prisma.apiKey.count)).not.toHaveBeenCalled();
      expect(vi.mocked(prisma.user.groupBy)).not.toHaveBeenCalled();
      expect(vi.mocked(prisma.user.findMany)).not.toHaveBeenCalled();
    });
  });

  // ===================================================================
  // Error handling
  // ===================================================================

  describe("error handling (allSettled fallback)", () => {
    it("should return 200 with fallback values when a single prisma query fails", async () => {
      mockAdminSessionScalar();

      vi.mocked(prisma.user.count).mockResolvedValueOnce(42);
      vi.mocked(prisma.user.count).mockResolvedValueOnce(30);
      vi.mocked(prisma.validation.count).mockRejectedValueOnce(new Error("DB connection lost"));

      // The rest will be auto-resolved by vitest mock (undefined → Promise.allSettled rejects)
      // We need to set the remaining 7 queries that haven't been set yet
      vi.mocked(prisma.validation.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.bulkJob.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.webhook.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.apiKey.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.user.groupBy).mockResolvedValueOnce([]);
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([]);

      const res = await GetAdminStats(createRequest());
      const body: any = await json(res);

      // Should NOT crash — allSettled gracefully degrades
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      // The third query (validation.count for totalValidations) rejected → fallback 0
      expect(body.data.totalUsers).toBe(42);
      expect(body.data.activeUsers).toBe(30);
      expect(body.data.totalValidations).toBe(0);
      // loggerApi.warn should be called for the failed query
      expect(vi.mocked(loggerApi.warn)).toHaveBeenCalled();
      // loggerApi.error should NOT be called (the catch wasn't hit)
      expect(vi.mocked(loggerApi.error)).not.toHaveBeenCalled();
    });

    it("should return 200 with fallback when validation.count fails", async () => {
      mockAdminSessionScalar();

      vi.mocked(prisma.user.count).mockResolvedValueOnce(42);
      vi.mocked(prisma.user.count).mockResolvedValueOnce(30);
      vi.mocked(prisma.validation.count).mockResolvedValueOnce(1500);
      vi.mocked(prisma.validation.count).mockRejectedValueOnce(new Error("validation error"));
      vi.mocked(prisma.bulkJob.count).mockResolvedValueOnce(12);
      vi.mocked(prisma.webhook.count).mockResolvedValueOnce(5);
      vi.mocked(prisma.apiKey.count).mockResolvedValueOnce(23);
      vi.mocked(prisma.user.groupBy).mockResolvedValueOnce([]);
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([]);

      const res = await GetAdminStats(createRequest());
      const body: any = await json(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.validationsToday).toBe(0); // fallback
      expect(vi.mocked(loggerApi.warn)).toHaveBeenCalled();
    });

    it("should return 200 with fallback when user.groupBy fails", async () => {
      mockAdminSessionScalar();

      vi.mocked(prisma.user.count).mockResolvedValueOnce(42);
      vi.mocked(prisma.user.count).mockResolvedValueOnce(30);
      vi.mocked(prisma.validation.count).mockResolvedValueOnce(1500);
      vi.mocked(prisma.validation.count).mockResolvedValueOnce(85);
      vi.mocked(prisma.bulkJob.count).mockResolvedValueOnce(12);
      vi.mocked(prisma.webhook.count).mockResolvedValueOnce(5);
      vi.mocked(prisma.apiKey.count).mockResolvedValueOnce(23);
      vi.mocked(prisma.user.groupBy).mockRejectedValueOnce(new Error("groupBy failed"));
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([]);

      const res = await GetAdminStats(createRequest());
      const body: any = await json(res);

      expect(res.status).toBe(200);
      expect(body.data.usersByPlan).toEqual([]); // fallback
      expect(vi.mocked(loggerApi.warn)).toHaveBeenCalled();
    });

    it("should return 200 with fallback when user.findMany fails", async () => {
      mockAdminSessionScalar();

      vi.mocked(prisma.user.count).mockResolvedValueOnce(42);
      vi.mocked(prisma.user.count).mockResolvedValueOnce(30);
      vi.mocked(prisma.validation.count).mockResolvedValueOnce(1500);
      vi.mocked(prisma.validation.count).mockResolvedValueOnce(85);
      vi.mocked(prisma.bulkJob.count).mockResolvedValueOnce(12);
      vi.mocked(prisma.webhook.count).mockResolvedValueOnce(5);
      vi.mocked(prisma.apiKey.count).mockResolvedValueOnce(23);
      vi.mocked(prisma.user.groupBy).mockResolvedValueOnce([]);
      vi.mocked(prisma.user.findMany).mockRejectedValueOnce(new Error("findMany failed"));

      const res = await GetAdminStats(createRequest());
      const body: any = await json(res);

      expect(res.status).toBe(200);
      expect(body.data.recentUsers).toEqual([]); // fallback
      expect(vi.mocked(loggerApi.warn)).toHaveBeenCalled();
    });
  });

  // ===================================================================
  // Edge cases
  // ===================================================================

  describe("edge cases", () => {
    it("should handle usersByPlan with null plan", async () => {
      mockAdminSessionScalar();

      vi.mocked(prisma.user.count).mockResolvedValueOnce(5);
      vi.mocked(prisma.user.count).mockResolvedValueOnce(3);
      vi.mocked(prisma.validation.count).mockResolvedValueOnce(10);
      vi.mocked(prisma.validation.count).mockResolvedValueOnce(1);
      vi.mocked(prisma.bulkJob.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.webhook.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.apiKey.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.user.groupBy).mockResolvedValueOnce([
        { plan: "FREE", _count: { id: 2 } },
        { plan: null, _count: { id: 1 } },
        { plan: "PRO", _count: { id: 2 } },
      ]);
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([]);

      const res = await GetAdminStats(createRequest());
      const body: any = await json(res);

      expect(res.status).toBe(200);
      expect(body.data.usersByPlan).toEqual([
        { plan: "FREE", count: 2 },
        { plan: null, count: 1 },
        { plan: "PRO", count: 2 },
      ]);
    });

    it("should handle recentUsers with null name and null email", async () => {
      mockAdminSessionScalar();

      vi.mocked(prisma.user.count).mockResolvedValueOnce(1);
      vi.mocked(prisma.user.count).mockResolvedValueOnce(1);
      vi.mocked(prisma.validation.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.validation.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.bulkJob.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.webhook.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.apiKey.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.user.groupBy).mockResolvedValueOnce([]);
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
        {
          id: "u-anon",
          name: null,
          email: null,
          plan: "FREE",
          isActive: true,
          createdAt: new Date("2026-06-30T00:00:00Z"),
        },
      ]);

      const res = await GetAdminStats(createRequest());
      const body: any = await json(res);

      expect(res.status).toBe(200);
      expect(body.data.recentUsers).toEqual([
        {
          id: "u-anon",
          name: null,
          email: null,
          plan: "FREE",
          isActive: true,
          createdAt: "2026-06-30T00:00:00.000Z",
        },
      ]);
    });

    it("should handle very large count values", async () => {
      mockAdminSessionScalar();

      vi.mocked(prisma.user.count).mockResolvedValueOnce(9999999);
      vi.mocked(prisma.user.count).mockResolvedValueOnce(5000000);
      vi.mocked(prisma.validation.count).mockResolvedValueOnce(9999999);
      vi.mocked(prisma.validation.count).mockResolvedValueOnce(9999999);
      vi.mocked(prisma.bulkJob.count).mockResolvedValueOnce(9999999);
      vi.mocked(prisma.webhook.count).mockResolvedValueOnce(9999999);
      vi.mocked(prisma.apiKey.count).mockResolvedValueOnce(9999999);
      vi.mocked(prisma.user.groupBy).mockResolvedValueOnce([
        { plan: "FREE", _count: { id: 9999999 } },
      ]);
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([]);

      const res = await GetAdminStats(createRequest());
      const body: any = await json(res);

      expect(res.status).toBe(200);
      expect(body.data.totalUsers).toBe(9999999);
      expect(body.data.activeUsers).toBe(5000000);
      expect(body.data.totalValidations).toBe(9999999);
      expect(body.data.validationsToday).toBe(9999999);
      expect(body.data.totalBulkJobs).toBe(9999999);
      expect(body.data.activeWebhooks).toBe(9999999);
      expect(body.data.totalApiKeys).toBe(9999999);
      expect(body.data.usersByPlan).toEqual([{ plan: "FREE", count: 9999999 }]);
    });
  });
});
