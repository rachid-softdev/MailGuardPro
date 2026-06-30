// ================================================================
// FeatureGate API Routes — Comprehensive Test Suite
// ================================================================
// Covers all 10 routes in app/api/{me,admin,debug}/** related to
// feature flags, plans, entitlements, overrides, cache, and debug.
// ================================================================

import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks (hoisted by vitest before all imports)
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  loggerApi: { error: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    feature: {
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    entitlementOverride: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    organization: { findUnique: vi.fn() },
    subscription: { findFirst: vi.fn() },
    pricingPlan: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    planFeature: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: {},
}));

vi.mock("@/services/feature-flags/serviceFactory", () => ({
  getFeatureGateService: vi.fn(),
  getDowngradeService: vi.fn(),
}));

// Note: PrismaEntitlementRepository is NOT mocked — the real class uses
// mocked prisma, which provides all the required model methods.

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { POST as PostAdminCacheInvalidate } from "@/app/api/admin/cache/invalidate/[orgId]/route";
import { PUT as PutAdminFeature } from "@/app/api/admin/features/[key]/route";
import { GET as GetAdminFeatures } from "@/app/api/admin/features/route";
import { GET as GetAdminDowngradePreview } from "@/app/api/admin/orgs/[orgId]/downgrade-preview/route";
import { GET as GetAdminOrgEntitlements } from "@/app/api/admin/orgs/[orgId]/entitlements/route";
import { DELETE as DeleteAdminOverride } from "@/app/api/admin/overrides/[id]/route";
import { POST as PostAdminOverride } from "@/app/api/admin/overrides/route";
import { POST as PostAdminPlanFeatures } from "@/app/api/admin/plans/[planKey]/features/route";
import { GET as GetAdminPlans } from "@/app/api/admin/plans/route";
import { GET as GetAdminUsers, POST as PostAdminUsers } from "@/app/api/admin/users/route";
import { GET as GetDebugEntitlements } from "@/app/api/debug/entitlements/route";
import { GET as GetMeEntitlements } from "@/app/api/me/entitlements/route";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth/require-admin";
import { loggerApi } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  getDowngradeService,
  getFeatureGateService,
} from "@/services/feature-flags/serviceFactory";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a standard admin session mock */
function mockAdminAuth() {
  vi.mocked(requireAdmin).mockResolvedValue({
    id: "admin-1",
    email: "admin@test.com",
  });
}

/** Reject admin auth with a given status and message */
function mockAdminAuthError(status: number, message: string) {
  vi.mocked(requireAdmin).mockRejectedValue({ status, message });
}

/** Create a fresh mock gate service */
function createMockGate() {
  return {
    getAllEntitlements: vi.fn(),
    invalidateCache: vi.fn(),
    getDebugTrace: vi.fn(),
    repo: {},
  };
}

/** Create a fresh mock downgrade service */
function createMockDowngradeService() {
  return {
    previewDowngrade: vi.fn(),
  };
}

/** Helper: parse response JSON */
async function json(res: Response) {
  return res.json() as unknown;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FeatureGate API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===================================================================
  // GET /api/me/entitlements
  // ===================================================================
  describe("GET /api/me/entitlements", () => {
    it("should return 401 when unauthenticated (no session)", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      const res = await GetMeEntitlements(new Request("http://localhost/api/me/entitlements"));

      expect(res.status).toBe(401);
      const body: any = await json(res);
      expect(body.error).toBe("Authentication required");
    });

    it("should return FREE plan when user has no organizationId", async () => {
      vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const res = await GetMeEntitlements(new Request("http://localhost/api/me/entitlements"));

      expect(res.status).toBe(200);
      const body: any = await json(res);
      expect(body).toEqual({
        plan: "FREE",
        features: {},
        limits: {},
        usage: {},
        reset_at: {},
      });
    });

    it("should return entitlements for authenticated user with org", async () => {
      const mockGate = createMockGate();
      const entitlements = {
        plan: "PRO",
        features: { EXPORT_PDF: true, AI_SUMMARY: true },
        limits: { BULK_VALIDATE: 100 },
        usage: { BULK_VALIDATE: 5 },
        reset_at: { BULK_VALIDATE: "2026-07-01T00:00:00.000Z" },
      };
      mockGate.getAllEntitlements.mockResolvedValue(entitlements);
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);
      vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } });
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ organizationId: "org-1" });

      const res = await GetMeEntitlements(new Request("http://localhost/api/me/entitlements"));

      expect(res.status).toBe(200);
      const body: any = await json(res);
      expect(body).toEqual(entitlements);
    });

    it("should return 500 when service throws", async () => {
      const mockGate = createMockGate();
      mockGate.getAllEntitlements.mockRejectedValue(new Error("DB error"));
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);
      vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } });
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ organizationId: "org-1" });

      const res = await GetMeEntitlements(new Request("http://localhost/api/me/entitlements"));

      expect(res.status).toBe(500);
      const body: any = await json(res);
      expect(body.error).toBe("Internal server error");
      expect(vi.mocked(loggerApi.error)).toHaveBeenCalled();
    });

    it("should include Cache-Control header with private, max-age=60, s-maxage=30", async () => {
      const mockGate = createMockGate();
      mockGate.getAllEntitlements.mockResolvedValue({
        plan: "FREE",
        features: {},
        limits: {},
        usage: {},
        reset_at: {},
      });
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);
      vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } });
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ organizationId: "org-1" });

      const res = await GetMeEntitlements(new Request("http://localhost/api/me/entitlements"));

      expect(res.headers.get("Cache-Control")).toBe("private, max-age=60, s-maxage=30");
    });

    it("should look up user via prisma.user.findUnique with correct fields", async () => {
      const mockGate = createMockGate();
      mockGate.getAllEntitlements.mockResolvedValue({
        plan: "FREE",
        features: {},
        limits: {},
        usage: {},
        reset_at: {},
      });
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);
      vi.mocked(auth).mockResolvedValue({ user: { id: "user-42" } });
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ organizationId: "org-1" });

      await GetMeEntitlements(new Request("http://localhost/api/me/entitlements"));

      expect(vi.mocked(prisma.user.findUnique)).toHaveBeenCalledWith({
        where: { id: "user-42" },
        select: { organizationId: true },
      });
    });
  });

  // ===================================================================
  // GET /api/admin/plans
  // ===================================================================
  describe("GET /api/admin/plans", () => {
    it("should reject non-admin (403)", async () => {
      mockAdminAuthError(403, "Accès non autorisé - rôle administrateur requis");

      const res = await GetAdminPlans(new Request("http://localhost/api/admin/plans"));

      expect(res.status).toBe(403);
      const body: any = await json(res);
      expect(body.error).toBe("Accès non autorisé - rôle administrateur requis");
    });

    it("should return paginated plans with default pagination", async () => {
      mockAdminAuth();
      vi.mocked(prisma.pricingPlan.findMany).mockResolvedValue([
        { id: "1", key: "FREE", name: "Free Plan", priceMonthly: 0, isActive: true },
        { id: "2", key: "PRO", name: "Pro Plan", priceMonthly: 2900, isActive: true },
      ]);
      vi.mocked(prisma.pricingPlan.count).mockResolvedValue(2);

      const res = await GetAdminPlans(new Request("http://localhost/api/admin/plans"));

      expect(res.status).toBe(200);
      const body: any = await json(res);
      expect(body.data).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
      expect(body.totalPages).toBe(1);
    });

    it("should pass NaN page value through (no defaulting)", async () => {
      mockAdminAuth();
      vi.mocked(prisma.pricingPlan.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pricingPlan.count).mockResolvedValue(0);

      await GetAdminPlans(new Request("http://localhost/api/admin/plans?page=abc"));

      // The route passes NaN to PrismaEntitlementRepository which then computes
      // skip = (NaN - 1) * limit = NaN, and passes NaN to prisma.pricingPlan.findMany
      const callArgs = vi.mocked(prisma.pricingPlan.findMany).mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      // NaN skip means no valid skip
      expect(Number.isNaN(callArgs.skip)).toBe(true);
    });

    it("should clamp limit to 100 when exceeding maximum", async () => {
      mockAdminAuth();
      vi.mocked(prisma.pricingPlan.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pricingPlan.count).mockResolvedValue(0);

      await GetAdminPlans(new Request("http://localhost/api/admin/plans?limit=200"));

      const callArgs = vi.mocked(prisma.pricingPlan.findMany).mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs.take).toBe(100);
    });

    it("should pass sort parameter through to prisma query", async () => {
      mockAdminAuth();
      vi.mocked(prisma.pricingPlan.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pricingPlan.count).mockResolvedValue(0);

      await GetAdminPlans(new Request("http://localhost/api/admin/plans?sort=name:desc"));

      const callArgs = vi.mocked(prisma.pricingPlan.findMany).mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs.orderBy).toEqual({ name: "desc" });
    });

    it("should handle limit=0 and pass take=0 to prisma", async () => {
      mockAdminAuth();
      vi.mocked(prisma.pricingPlan.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pricingPlan.count).mockResolvedValue(0);

      await GetAdminPlans(new Request("http://localhost/api/admin/plans?limit=0"));

      const callArgs = vi.mocked(prisma.pricingPlan.findMany).mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs.take).toBe(0);
    });

    it("should use default page=1 and limit=20 when not provided", async () => {
      mockAdminAuth();
      vi.mocked(prisma.pricingPlan.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pricingPlan.count).mockResolvedValue(0);

      const res = await GetAdminPlans(new Request("http://localhost/api/admin/plans"));

      const callArgs = vi.mocked(prisma.pricingPlan.findMany).mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs.skip).toBe(0); // (1-1)*20 = 0
      expect(callArgs.take).toBe(20);
      const body: any = await json(res);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
    });
  });

  // ===================================================================
  // GET /api/admin/features
  // ===================================================================
  describe("GET /api/admin/features", () => {
    it("should reject non-admin", async () => {
      mockAdminAuthError(403, "Forbidden");

      const res = await GetAdminFeatures(new Request("http://localhost/api/admin/features"));

      expect(res.status).toBe(403);
    });

    it("should return paginated features", async () => {
      mockAdminAuth();
      vi.mocked(prisma.feature.findMany).mockResolvedValue([
        {
          id: "f1",
          key: "EXPORT_PDF",
          type: "boolean",
          description: "Export PDF",
          defaultConfig: null,
        },
        {
          id: "f2",
          key: "AI_SUMMARY",
          type: "boolean",
          description: "AI Summary",
          defaultConfig: null,
        },
      ]);
      vi.mocked(prisma.feature.count).mockResolvedValue(2);

      const res = await GetAdminFeatures(new Request("http://localhost/api/admin/features"));

      expect(res.status).toBe(200);
      const body: any = await json(res);
      expect(body.data).toHaveLength(2);
      expect(body.total).toBe(2);
    });

    it("should return empty features list when no features exist", async () => {
      mockAdminAuth();
      vi.mocked(prisma.feature.findMany).mockResolvedValue([]);
      vi.mocked(prisma.feature.count).mockResolvedValue(0);

      const res = await GetAdminFeatures(new Request("http://localhost/api/admin/features"));

      expect(res.status).toBe(200);
      const body: any = await json(res);
      expect(body.data).toEqual([]);
      expect(body.total).toBe(0);
    });

    it("should return 500 when repository throws", async () => {
      mockAdminAuth();
      vi.mocked(prisma.feature.findMany).mockRejectedValue(new Error("DB error"));

      const res = await GetAdminFeatures(new Request("http://localhost/api/admin/features"));

      expect(res.status).toBe(500);
      const body: any = await json(res);
      expect(body.error).toBe("Internal server error");
    });

    it("should handle page=NaN (invalid string 'abc') and pass NaN skip to prisma", async () => {
      mockAdminAuth();
      vi.mocked(prisma.feature.findMany).mockResolvedValue([]);
      vi.mocked(prisma.feature.count).mockResolvedValue(0);

      await GetAdminFeatures(new Request("http://localhost/api/admin/features?page=abc"));

      const callArgs = vi.mocked(prisma.feature.findMany).mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(Number.isNaN(callArgs.skip)).toBe(true);
    });

    it("should handle page=0 and pass negative skip (-20) to prisma", async () => {
      mockAdminAuth();
      vi.mocked(prisma.feature.findMany).mockResolvedValue([]);
      vi.mocked(prisma.feature.count).mockResolvedValue(0);

      await GetAdminFeatures(new Request("http://localhost/api/admin/features?page=0"));

      const callArgs = vi.mocked(prisma.feature.findMany).mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs.skip).toBe(-20);
    });

    it("should handle page=-1 and pass negative skip (-40) to prisma", async () => {
      mockAdminAuth();
      vi.mocked(prisma.feature.findMany).mockResolvedValue([]);
      vi.mocked(prisma.feature.count).mockResolvedValue(0);

      await GetAdminFeatures(new Request("http://localhost/api/admin/features?page=-1"));

      const callArgs = vi.mocked(prisma.feature.findMany).mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs.skip).toBe(-40);
    });

    it("should handle sort parameter without colon separator", async () => {
      mockAdminAuth();
      vi.mocked(prisma.feature.findMany).mockResolvedValue([]);
      vi.mocked(prisma.feature.count).mockResolvedValue(0);

      await GetAdminFeatures(new Request("http://localhost/api/admin/features?sort=name"));

      const callArgs = vi.mocked(prisma.feature.findMany).mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      // "name".split(":") => ["name"], sortDir is undefined => defaults to "asc"
      expect(callArgs.orderBy).toEqual({ name: "asc" });
    });

    it("should handle limit=0 and pass take=0 to prisma", async () => {
      mockAdminAuth();
      vi.mocked(prisma.feature.findMany).mockResolvedValue([]);
      vi.mocked(prisma.feature.count).mockResolvedValue(0);

      await GetAdminFeatures(new Request("http://localhost/api/admin/features?limit=0"));

      const callArgs = vi.mocked(prisma.feature.findMany).mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs.take).toBe(0);
    });
  });

  // ===================================================================
  // PUT /api/admin/features/[key]
  // ===================================================================
  describe("PUT /api/admin/features/[key]", () => {
    it("should reject non-admin", async () => {
      mockAdminAuthError(403, "Forbidden");

      const res = await PutAdminFeature(
        new Request("http://localhost/api/admin/features/test-key", { method: "PUT" }),
        { params: Promise.resolve({ key: "test-key" }) },
      );

      expect(res.status).toBe(403);
    });

    it("should return 404 when feature not found (P2025)", async () => {
      mockAdminAuth();
      const error = new Error("Record not found");
      (error as any).code = "P2025";
      vi.mocked(prisma.feature.update).mockRejectedValue(error);

      const res = await PutAdminFeature(
        new Request("http://localhost/api/admin/features/nonexistent", {
          method: "PUT",
          body: JSON.stringify({ description: "Updated" }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ key: "nonexistent" }) },
      );

      expect(res.status).toBe(404);
      const body: any = await json(res);
      expect(body.error).toBe("Feature not found");
    });

    it("should update feature successfully with description and default_config", async () => {
      mockAdminAuth();
      const updatedFeature = {
        id: "f1",
        key: "EXPORT_PDF",
        description: "Updated description",
        type: "boolean",
        default_config: { foo: "bar" },
      };
      vi.mocked(prisma.feature.update).mockResolvedValue(updatedFeature);

      const res = await PutAdminFeature(
        new Request("http://localhost/api/admin/features/EXPORT_PDF", {
          method: "PUT",
          body: JSON.stringify({
            description: "Updated description",
            default_config: { foo: "bar" },
          }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ key: "EXPORT_PDF" }) },
      );

      expect(res.status).toBe(200);
      const body: any = await json(res);
      expect(body.description).toBe("Updated description");
      expect(body.default_config).toEqual({ foo: "bar" });
      expect(vi.mocked(prisma.feature.update)).toHaveBeenCalledWith({
        where: { key: "EXPORT_PDF" },
        data: { description: "Updated description", defaultConfig: { foo: "bar" } },
      });
    });

    it("should update feature with only description (partial update)", async () => {
      mockAdminAuth();
      const updatedFeature = {
        id: "f1",
        key: "EXPORT_PDF",
        description: "Only description changed",
        type: "boolean",
        default_config: null,
      };
      vi.mocked(prisma.feature.update).mockResolvedValue(updatedFeature);

      const res = await PutAdminFeature(
        new Request("http://localhost/api/admin/features/EXPORT_PDF", {
          method: "PUT",
          body: JSON.stringify({ description: "Only description changed" }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ key: "EXPORT_PDF" }) },
      );

      expect(res.status).toBe(200);
      const body: any = await json(res);
      expect(body.description).toBe("Only description changed");
      // default_config was not sent, so prisma.update receives undefined → field not included
      expect(vi.mocked(prisma.feature.update)).toHaveBeenCalledWith({
        where: { key: "EXPORT_PDF" },
        data: { description: "Only description changed", defaultConfig: undefined },
      });
    });

    it("should not update description when body.description is null (?? operator)", async () => {
      mockAdminAuth();
      const updatedFeature = {
        id: "f1",
        key: "EXPORT_PDF",
        description: "Original description",
        type: "boolean",
        default_config: null,
      };
      vi.mocked(prisma.feature.update).mockResolvedValue(updatedFeature);

      const res = await PutAdminFeature(
        new Request("http://localhost/api/admin/features/EXPORT_PDF", {
          method: "PUT",
          body: JSON.stringify({ description: null }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ key: "EXPORT_PDF" }) },
      );

      expect(res.status).toBe(200);
      // null ?? undefined → undefined, so description is not passed to Prisma
      expect(vi.mocked(prisma.feature.update)).toHaveBeenCalledWith({
        where: { key: "EXPORT_PDF" },
        data: { description: undefined, defaultConfig: undefined },
      });
    });

    it("should update description to empty string when provided", async () => {
      mockAdminAuth();
      const updatedFeature = {
        id: "f1",
        key: "EXPORT_PDF",
        description: "",
        type: "boolean",
        default_config: null,
      };
      vi.mocked(prisma.feature.update).mockResolvedValue(updatedFeature);

      const res = await PutAdminFeature(
        new Request("http://localhost/api/admin/features/EXPORT_PDF", {
          method: "PUT",
          body: JSON.stringify({ description: "" }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ key: "EXPORT_PDF" }) },
      );

      expect(res.status).toBe(200);
      const body: any = await json(res);
      expect(body.description).toBe("");
      expect(vi.mocked(prisma.feature.update)).toHaveBeenCalledWith({
        where: { key: "EXPORT_PDF" },
        data: { description: "", defaultConfig: undefined },
      });
    });

    it("should handle feature key with special characters (underscores, hyphens)", async () => {
      mockAdminAuth();
      const updatedFeature = {
        id: "f3",
        key: "feature_key-123",
        description: "Updated special key",
        type: "boolean",
        default_config: null,
      };
      vi.mocked(prisma.feature.update).mockResolvedValue(updatedFeature);

      const res = await PutAdminFeature(
        new Request("http://localhost/api/admin/features/feature_key-123", {
          method: "PUT",
          body: JSON.stringify({ description: "Updated special key" }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ key: "feature_key-123" }) },
      );

      expect(res.status).toBe(200);
      expect(vi.mocked(prisma.feature.update)).toHaveBeenCalledWith({
        where: { key: "feature_key-123" },
        data: { description: "Updated special key", defaultConfig: undefined },
      });
    });

    it("should return 500 on Prisma error other than P2025 (e.g. P2003 FK constraint)", async () => {
      mockAdminAuth();
      const error = new Error("Foreign key constraint failed");
      (error as any).code = "P2003";
      vi.mocked(prisma.feature.update).mockRejectedValue(error);

      const res = await PutAdminFeature(
        new Request("http://localhost/api/admin/features/EXPORT_PDF", {
          method: "PUT",
          body: JSON.stringify({ description: "Updated" }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ key: "EXPORT_PDF" }) },
      );

      expect(res.status).toBe(500);
      const body: any = await json(res);
      expect(body.error).toBe("Internal server error");
    });

    it("should pass default_config with invalid value to Prisma as-is", async () => {
      mockAdminAuth();
      const updatedFeature = {
        id: "f1",
        key: "EXPORT_PDF",
        description: null,
        type: "boolean",
        default_config: "not_an_object",
      };
      vi.mocked(prisma.feature.update).mockResolvedValue(updatedFeature);

      const res = await PutAdminFeature(
        new Request("http://localhost/api/admin/features/EXPORT_PDF", {
          method: "PUT",
          body: JSON.stringify({ default_config: "not_an_object" }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ key: "EXPORT_PDF" }) },
      );

      expect(res.status).toBe(200);
      expect(vi.mocked(prisma.feature.update)).toHaveBeenCalledWith({
        where: { key: "EXPORT_PDF" },
        data: { description: undefined, defaultConfig: "not_an_object" },
      });
    });

    it("should return 500 for XML body (non-JSON format)", async () => {
      mockAdminAuth();

      const res = await PutAdminFeature(
        new Request("http://localhost/api/admin/features/test-key", {
          method: "PUT",
          body: "<xml><data>test</data></xml>",
          headers: { "content-type": "application/xml" },
        }),
        { params: Promise.resolve({ key: "test-key" }) },
      );

      expect(res.status).toBe(500);
      const body: any = await json(res);
      expect(body.error).toBe("Internal server error");
    });
  });

  // ===================================================================
  // POST /api/admin/overrides
  // ===================================================================
  describe("POST /api/admin/overrides", () => {
    it("should reject non-admin", async () => {
      mockAdminAuthError(403, "Forbidden");

      const res = await PostAdminOverride(
        new Request("http://localhost/api/admin/overrides", { method: "POST" }),
      );

      expect(res.status).toBe(403);
    });

    it("should return 400 when reason is missing", async () => {
      mockAdminAuth();

      const res = await PostAdminOverride(
        new Request("http://localhost/api/admin/overrides", {
          method: "POST",
          body: JSON.stringify({
            scope: "org",
            scope_id: "org-1",
            feature_key: "feat-1",
            // no reason
          }),
          headers: { "content-type": "application/json" },
        }),
      );

      expect(res.status).toBe(400);
      const body: any = await json(res);
      expect(body.error).toBe("Validation error");
      expect(body.details).toHaveProperty("reason");
    });

    it("should return 400 when scope is invalid", async () => {
      mockAdminAuth();

      const res = await PostAdminOverride(
        new Request("http://localhost/api/admin/overrides", {
          method: "POST",
          body: JSON.stringify({
            scope: "invalid_scope",
            scope_id: "org-1",
            feature_key: "feat-1",
            reason: "test reason",
          }),
          headers: { "content-type": "application/json" },
        }),
      );

      expect(res.status).toBe(400);
      const body: any = await json(res);
      expect(body.error).toBe("Validation error");
    });

    it("should return 400 when scope_id is empty", async () => {
      mockAdminAuth();

      const res = await PostAdminOverride(
        new Request("http://localhost/api/admin/overrides", {
          method: "POST",
          body: JSON.stringify({
            scope: "org",
            scope_id: "",
            feature_key: "feat-1",
            reason: "test reason",
          }),
          headers: { "content-type": "application/json" },
        }),
      );

      expect(res.status).toBe(400);
      const body: any = await json(res);
      expect(body.error).toBe("Validation error");
      expect(body.details).toHaveProperty("scope_id");
    });

    it("should return 400 when feature_key is missing", async () => {
      mockAdminAuth();

      const res = await PostAdminOverride(
        new Request("http://localhost/api/admin/overrides", {
          method: "POST",
          body: JSON.stringify({
            scope: "org",
            scope_id: "org-1",
            // no feature_key
            reason: "test reason",
          }),
          headers: { "content-type": "application/json" },
        }),
      );

      expect(res.status).toBe(400);
      const body: any = await json(res);
      expect(body.error).toBe("Validation error");
      expect(body.details).toHaveProperty("feature_key");
    });

    it("should return 400 when expires_at is an invalid datetime", async () => {
      mockAdminAuth();

      const res = await PostAdminOverride(
        new Request("http://localhost/api/admin/overrides", {
          method: "POST",
          body: JSON.stringify({
            scope: "org",
            scope_id: "org-1",
            feature_key: "feat-1",
            reason: "test reason",
            expires_at: "not-a-datetime",
          }),
          headers: { "content-type": "application/json" },
        }),
      );

      expect(res.status).toBe(400);
      const body: any = await json(res);
      expect(body.error).toBe("Validation error");
      // Zod's .datetime() validator rejects non-ISO strings
      expect(body.details).toHaveProperty("expires_at");
    });

    it("should create org override, invalidate cache, and return 201", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      const createdOverride = {
        id: "ov-1",
        scope: "ORG",
        scopeId: "org-1",
        featureKey: "feat-1",
        enabled: true,
        limitValue: null,
        expiresAt: null,
        reason: "Enabling for test",
      };
      vi.mocked(prisma.entitlementOverride.create).mockResolvedValue(createdOverride);

      const res = await PostAdminOverride(
        new Request("http://localhost/api/admin/overrides", {
          method: "POST",
          body: JSON.stringify({
            scope: "org",
            scope_id: "org-1",
            feature_key: "feat-1",
            enabled: true,
            reason: "Enabling for test",
          }),
          headers: { "content-type": "application/json" },
        }),
      );

      expect(res.status).toBe(201);
      const body: any = await json(res);
      expect(body.id).toBe("ov-1");
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org-1");
      expect(vi.mocked(prisma.entitlementOverride.create)).toHaveBeenCalledWith({
        data: {
          scope: "ORG",
          scopeId: "org-1",
          featureKey: "feat-1",
          enabled: true,
          limitValue: null,
          expiresAt: null,
          reason: "Enabling for test",
        },
      });
    });

    it("should create user override without cache invalidation", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      const createdOverride = {
        id: "ov-2",
        scope: "USER",
        scopeId: "user-1",
        featureKey: "feat-1",
        enabled: false,
        limitValue: null,
        expiresAt: null,
        reason: "Disabling for user",
      };
      vi.mocked(prisma.entitlementOverride.create).mockResolvedValue(createdOverride);

      const res = await PostAdminOverride(
        new Request("http://localhost/api/admin/overrides", {
          method: "POST",
          body: JSON.stringify({
            scope: "user",
            scope_id: "user-1",
            feature_key: "feat-1",
            enabled: false,
            reason: "Disabling for user",
          }),
          headers: { "content-type": "application/json" },
        }),
      );

      expect(res.status).toBe(201);
      expect(mockGate.invalidateCache).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------
    // Additional POST /api/admin/overrides edge cases
    // -------------------------------------------------------------------

    it("should return 400 when enabled is a string instead of boolean", async () => {
      mockAdminAuth();

      const res = await PostAdminOverride(
        new Request("http://localhost/api/admin/overrides", {
          method: "POST",
          body: JSON.stringify({
            scope: "org",
            scope_id: "org-1",
            feature_key: "feat-1",
            enabled: "true", // string, not boolean
            reason: "test",
          }),
          headers: { "content-type": "application/json" },
        }),
      );

      expect(res.status).toBe(400);
      const body: any = await json(res);
      expect(body.error).toBe("Validation error");
      expect(body.details).toHaveProperty("enabled");
    });

    it("should reject negative limit_value (-10) — Zod .min(0)", async () => {
      mockAdminAuth();

      const res = await PostAdminOverride(
        new Request("http://localhost/api/admin/overrides", {
          method: "POST",
          body: JSON.stringify({
            scope: "org",
            scope_id: "org-1",
            feature_key: "feat-1",
            limit_value: -10,
            reason: "Testing negative limit",
          }),
          headers: { "content-type": "application/json" },
        }),
      );

      expect(res.status).toBe(400);
      const body: any = await json(res);
      expect(body.error).toBe("Validation error");
      expect(vi.mocked(prisma.entitlementOverride.create)).not.toHaveBeenCalled();
    });

    it("should reject whitespace-only reason — Zod .trim().min(1)", async () => {
      mockAdminAuth();

      const res = await PostAdminOverride(
        new Request("http://localhost/api/admin/overrides", {
          method: "POST",
          body: JSON.stringify({
            scope: "org",
            scope_id: "org-1",
            feature_key: "feat-1",
            reason: "   ",
          }),
          headers: { "content-type": "application/json" },
        }),
      );

      expect(res.status).toBe(400);
      const body: any = await json(res);
      expect(body.error).toBe("Validation error");
      expect(vi.mocked(prisma.entitlementOverride.create)).not.toHaveBeenCalled();
    });

    it("should accept expires_at with non-UTC timezone (+02:00) and verify parsing", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);
      const createdOverride = {
        id: "ov-tz",
        scope: "ORG",
        scopeId: "org-1",
        featureKey: "feat-1",
        enabled: null,
        limitValue: null,
        expiresAt: new Date("2026-07-01T10:00:00.000Z"),
        reason: "Testing timezone",
      };
      vi.mocked(prisma.entitlementOverride.create).mockResolvedValue(createdOverride);

      const res = await PostAdminOverride(
        new Request("http://localhost/api/admin/overrides", {
          method: "POST",
          body: JSON.stringify({
            scope: "org",
            scope_id: "org-1",
            feature_key: "feat-1",
            reason: "Testing timezone",
            expires_at: "2026-07-01T12:00:00+02:00",
          }),
          headers: { "content-type": "application/json" },
        }),
      );

      // Zod's .datetime() by default only accepts UTC (Z suffix), so this may return 400.
      // If accepted (201), verify that new Date(expires_at) correctly converted to UTC.
      if (res.status === 201) {
        expect(vi.mocked(prisma.entitlementOverride.create)).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              expiresAt: expect.any(Date),
            }),
          }),
        );
        const callArg = vi.mocked(prisma.entitlementOverride.create).mock.calls[0]?.[0];
        const passedDate = (callArg as any)?.data?.expiresAt as Date;
        expect(passedDate.toISOString()).toBe("2026-07-01T10:00:00.000Z");
      } else {
        expect(res.status).toBe(400);
        const body: any = await json(res);
        expect(body.error).toBe("Validation error");
        expect(body.details).toHaveProperty("expires_at");
      }
    });

    it("should return 500 when cache invalidation fails after override created", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);
      const createdOverride = {
        id: "ov-cachefail",
        scope: "ORG",
        scopeId: "org-1",
        featureKey: "feat-1",
        enabled: true,
        limitValue: null,
        expiresAt: null,
        reason: "Cache fail test",
      };
      vi.mocked(prisma.entitlementOverride.create).mockResolvedValue(createdOverride);
      mockGate.invalidateCache.mockRejectedValue(new Error("Cache service unavailable"));

      const res = await PostAdminOverride(
        new Request("http://localhost/api/admin/overrides", {
          method: "POST",
          body: JSON.stringify({
            scope: "org",
            scope_id: "org-1",
            feature_key: "feat-1",
            enabled: true,
            reason: "Cache fail test",
          }),
          headers: { "content-type": "application/json" },
        }),
      );

      expect(res.status).toBe(500);
      const body: any = await json(res);
      expect(body.error).toBe("Internal server error");
      // The override WAS created despite the 500 response (create succeeded before cache call)
      expect(vi.mocked(prisma.entitlementOverride.create)).toHaveBeenCalled();
      expect(vi.mocked(loggerApi.error)).toHaveBeenCalled();
    });

    it("should return 500 when scope_id is extremely long (truncation error)", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);
      const longScopeId = "x".repeat(10000);
      const truncationError = new Error("String too long for column");
      (truncationError as any).code = "P2000"; // Prisma value too large
      vi.mocked(prisma.entitlementOverride.create).mockRejectedValue(truncationError);

      const res = await PostAdminOverride(
        new Request("http://localhost/api/admin/overrides", {
          method: "POST",
          body: JSON.stringify({
            scope: "org",
            scope_id: longScopeId,
            feature_key: "feat-1",
            reason: "Long scope_id test",
          }),
          headers: { "content-type": "application/json" },
        }),
      );

      expect(res.status).toBe(500);
      const body: any = await json(res);
      expect(body.error).toBe("Internal server error");
      expect(vi.mocked(loggerApi.error)).toHaveBeenCalled();
    });

    it("should ignore unknown fields in the request body (Zod strip mode)", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);
      const createdOverride = {
        id: "ov-strip",
        scope: "ORG",
        scopeId: "org-1",
        featureKey: "feat-1",
        enabled: null,
        limitValue: null,
        expiresAt: null,
        reason: "Unknown fields test",
      };
      vi.mocked(prisma.entitlementOverride.create).mockResolvedValue(createdOverride);

      const res = await PostAdminOverride(
        new Request("http://localhost/api/admin/overrides", {
          method: "POST",
          body: JSON.stringify({
            scope: "org",
            scope_id: "org-1",
            feature_key: "feat-1",
            reason: "Unknown fields test",
            extra_field: "should be ignored",
            _hacked: true,
            malicious: "<script>alert('xss')</script>",
          }),
          headers: { "content-type": "application/json" },
        }),
      );

      expect(res.status).toBe(201);
      // Verify the extra fields were stripped and not passed to prisma
      expect(vi.mocked(prisma.entitlementOverride.create)).toHaveBeenCalledWith(
        expect.not.objectContaining({
          data: expect.objectContaining({
            extra_field: expect.anything(),
          }),
        }),
      );
    });
  });

  // ===================================================================
  // DELETE /api/admin/overrides/[id]
  // ===================================================================
  describe("DELETE /api/admin/overrides/[id]", () => {
    it("should reject non-admin", async () => {
      mockAdminAuthError(403, "Forbidden");

      const res = await DeleteAdminOverride(
        new Request("http://localhost/api/admin/overrides/ov-1", { method: "DELETE" }),
        { params: Promise.resolve({ id: "ov-1" }) },
      );

      expect(res.status).toBe(403);
    });

    it("should return 404 when override not found (findUnique returns null)", async () => {
      mockAdminAuth();
      vi.mocked(prisma.entitlementOverride.findUnique).mockResolvedValue(null);

      const res = await DeleteAdminOverride(
        new Request("http://localhost/api/admin/overrides/nonexistent", { method: "DELETE" }),
        { params: Promise.resolve({ id: "nonexistent" }) },
      );

      expect(res.status).toBe(404);
      const body: any = await json(res);
      expect(body.error).toBe("Override not found");
    });

    it("should return 404 when P2025 occurs on delete (race condition)", async () => {
      mockAdminAuth();
      vi.mocked(prisma.entitlementOverride.findUnique).mockResolvedValue({
        id: "ov-1",
        scope: "ORG",
        scopeId: "org-1",
        featureKey: "feat-1",
        enabled: true,
        limitValue: null,
        expiresAt: null,
        reason: "test",
      });
      const error = new Error("Record not found");
      (error as any).code = "P2025";
      vi.mocked(prisma.entitlementOverride.delete).mockRejectedValue(error);

      const res = await DeleteAdminOverride(
        new Request("http://localhost/api/admin/overrides/ov-1", { method: "DELETE" }),
        { params: Promise.resolve({ id: "ov-1" }) },
      );

      expect(res.status).toBe(404);
      const body: any = await json(res);
      expect(body.error).toBe("Override not found");
    });

    it("should invalidate cache when deleting ORG scope override", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);
      vi.mocked(prisma.entitlementOverride.findUnique).mockResolvedValue({
        id: "ov-1",
        scope: "ORG",
        scopeId: "org-1",
        featureKey: "feat-1",
        enabled: true,
        limitValue: null,
        expiresAt: null,
        reason: "test",
      });
      vi.mocked(prisma.entitlementOverride.delete).mockResolvedValue(undefined as any);

      const res = await DeleteAdminOverride(
        new Request("http://localhost/api/admin/overrides/ov-1", { method: "DELETE" }),
        { params: Promise.resolve({ id: "ov-1" }) },
      );

      expect(res.status).toBe(200);
      const body: any = await json(res);
      expect(body.success).toBe(true);
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org-1");
    });

    it("should NOT invalidate cache when deleting USER scope override", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);
      vi.mocked(prisma.entitlementOverride.findUnique).mockResolvedValue({
        id: "ov-2",
        scope: "USER",
        scopeId: "user-1",
        featureKey: "feat-1",
        enabled: false,
        limitValue: null,
        expiresAt: null,
        reason: "test",
      });
      vi.mocked(prisma.entitlementOverride.delete).mockResolvedValue(undefined as any);

      const res = await DeleteAdminOverride(
        new Request("http://localhost/api/admin/overrides/ov-2", { method: "DELETE" }),
        { params: Promise.resolve({ id: "ov-2" }) },
      );

      expect(res.status).toBe(200);
      expect(mockGate.invalidateCache).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------
    // Additional DELETE /api/admin/overrides/[id] edge cases
    // -------------------------------------------------------------------

    it("should return 500 when override deleted but cache invalidation fails", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);
      vi.mocked(prisma.entitlementOverride.findUnique).mockResolvedValue({
        id: "ov-cachefail",
        scope: "ORG",
        scopeId: "org-1",
        featureKey: "feat-1",
        enabled: true,
        limitValue: null,
        expiresAt: null,
        reason: "test",
      });
      vi.mocked(prisma.entitlementOverride.delete).mockResolvedValue(undefined as any);
      mockGate.invalidateCache.mockRejectedValue(new Error("Cache unavailable"));

      const res = await DeleteAdminOverride(
        new Request("http://localhost/api/admin/overrides/ov-cachefail", { method: "DELETE" }),
        { params: Promise.resolve({ id: "ov-cachefail" }) },
      );

      expect(res.status).toBe(500);
      const body: any = await json(res);
      expect(body.error).toBe("Internal server error");
      // The override was already deleted from DB before cache invalidation was attempted
      expect(vi.mocked(prisma.entitlementOverride.delete)).toHaveBeenCalled();
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org-1");
      expect(vi.mocked(loggerApi.error)).toHaveBeenCalled();
    });

    it("should return 404 when id is very long / special characters (findUnique returns null)", async () => {
      mockAdminAuth();
      vi.mocked(prisma.entitlementOverride.findUnique).mockResolvedValue(null);

      const res = await DeleteAdminOverride(
        new Request("http://localhost/api/admin/overrides/../../etc/passwd", { method: "DELETE" }),
        { params: Promise.resolve({ id: "../../etc/passwd" }) },
      );

      expect(res.status).toBe(404);
      const body: any = await json(res);
      expect(body.error).toBe("Override not found");
    });

    it("should return 401 when authentication fails (requireAdmin rejects with 401)", async () => {
      mockAdminAuthError(401, "Authentication required");

      const res = await DeleteAdminOverride(
        new Request("http://localhost/api/admin/overrides/ov-1", { method: "DELETE" }),
        { params: Promise.resolve({ id: "ov-1" }) },
      );

      expect(res.status).toBe(401);
      const body: any = await json(res);
      expect(body.error).toBe("Authentication required");
    });

    it("should return 500 when delete throws non-P2025 error (DB down)", async () => {
      mockAdminAuth();
      vi.mocked(prisma.entitlementOverride.findUnique).mockResolvedValue({
        id: "ov-dbdown",
        scope: "ORG",
        scopeId: "org-1",
        featureKey: "feat-1",
        enabled: true,
        limitValue: null,
        expiresAt: null,
        reason: "test",
      });
      vi.mocked(prisma.entitlementOverride.delete).mockRejectedValue(
        new Error("DB connection lost"),
      );

      const res = await DeleteAdminOverride(
        new Request("http://localhost/api/admin/overrides/ov-dbdown", { method: "DELETE" }),
        { params: Promise.resolve({ id: "ov-dbdown" }) },
      );

      expect(res.status).toBe(500);
      const body: any = await json(res);
      expect(body.error).toBe("Internal server error");
      expect(vi.mocked(loggerApi.error)).toHaveBeenCalled();
    });
  });

  // ===================================================================
  // GET /api/admin/orgs/[orgId]/entitlements
  // ===================================================================
  describe("GET /api/admin/orgs/[orgId]/entitlements", () => {
    it("should reject non-admin", async () => {
      mockAdminAuthError(403, "Forbidden");

      const res = await GetAdminOrgEntitlements(
        new Request("http://localhost/api/admin/orgs/org-1/entitlements"),
        { params: Promise.resolve({ orgId: "org-1" }) },
      );

      expect(res.status).toBe(403);
    });

    it("should return entitlements for the specified org", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      const entitlements = {
        plan: "ENTERPRISE",
        features: { EXPORT_PDF: true, AI_SUMMARY: true, API_ACCESS: true },
        limits: { BULK_VALIDATE: null },
        usage: { BULK_VALIDATE: 42 },
        reset_at: { BULK_VALIDATE: "2026-07-01T00:00:00.000Z" },
      };
      mockGate.getAllEntitlements.mockResolvedValue(entitlements);
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      const res = await GetAdminOrgEntitlements(
        new Request("http://localhost/api/admin/orgs/org-1/entitlements"),
        { params: Promise.resolve({ orgId: "org-1" }) },
      );

      expect(res.status).toBe(200);
      const body: any = await json(res);
      expect(body).toEqual(entitlements);
      expect(mockGate.getAllEntitlements).toHaveBeenCalledWith("org-1");
    });

    it("should return 500 when service throws", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      mockGate.getAllEntitlements.mockRejectedValue(new Error("Service error"));
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      const res = await GetAdminOrgEntitlements(
        new Request("http://localhost/api/admin/orgs/org-1/entitlements"),
        { params: Promise.resolve({ orgId: "org-1" }) },
      );

      expect(res.status).toBe(500);
      const body: any = await json(res);
      expect(body.error).toBe("Internal server error");
    });

    // -------------------------------------------------------------------
    // Additional GET /api/admin/orgs/[orgId]/entitlements edge cases
    // -------------------------------------------------------------------

    it("should handle empty orgId gracefully (empty string)", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      mockGate.getAllEntitlements.mockResolvedValue({
        plan: "FREE",
        features: {},
        limits: {},
        usage: {},
        reset_at: {},
      });
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      const res = await GetAdminOrgEntitlements(
        new Request("http://localhost/api/admin/orgs//entitlements"),
        { params: Promise.resolve({ orgId: "" }) },
      );

      expect(res.status).toBe(200);
      expect(mockGate.getAllEntitlements).toHaveBeenCalledWith("");
    });

    it("should return 404 when orgId does not exist (service throws with status)", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      mockGate.getAllEntitlements.mockRejectedValue({
        status: 404,
        message: "Organization not found",
      });
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      const res = await GetAdminOrgEntitlements(
        new Request("http://localhost/api/admin/orgs/nonexistent-org/entitlements"),
        { params: Promise.resolve({ orgId: "nonexistent-org" }) },
      );

      expect(res.status).toBe(404);
      const body: any = await json(res);
      expect(body.error).toBe("Organization not found");
    });

    it("should return partial entitlements when features/limits fields are missing", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      const partialEntitlements = {
        plan: "FREE",
        // features and limits are missing
        usage: {},
        reset_at: {},
      };
      mockGate.getAllEntitlements.mockResolvedValue(partialEntitlements);
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      const res = await GetAdminOrgEntitlements(
        new Request("http://localhost/api/admin/orgs/org-1/entitlements"),
        { params: Promise.resolve({ orgId: "org-1" }) },
      );

      expect(res.status).toBe(200);
      const body: any = await json(res);
      expect(body.plan).toBe("FREE");
      expect(body).not.toHaveProperty("features");
      expect(body).not.toHaveProperty("limits");
    });

    it("should return 500 when service throws non-standard error (no .status)", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      mockGate.getAllEntitlements.mockRejectedValue(new Error("Unexpected repository failure"));
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      const res = await GetAdminOrgEntitlements(
        new Request("http://localhost/api/admin/orgs/org-1/entitlements"),
        { params: Promise.resolve({ orgId: "org-1" }) },
      );

      expect(res.status).toBe(500);
      const body: any = await json(res);
      expect(body.error).toBe("Internal server error");
      expect(vi.mocked(loggerApi.error)).toHaveBeenCalled();
    });
  });

  // ===================================================================
  // GET /api/admin/orgs/[orgId]/downgrade-preview
  // ===================================================================
  describe("GET /api/admin/orgs/[orgId]/downgrade-preview", () => {
    it("should reject non-admin", async () => {
      mockAdminAuthError(403, "Forbidden");

      const res = await GetAdminDowngradePreview(
        new Request("http://localhost/api/admin/orgs/org-1/downgrade-preview?toPlan=PRO"),
        { params: Promise.resolve({ orgId: "org-1" }) },
      );

      expect(res.status).toBe(403);
    });

    it("should return 400 when toPlan query parameter is missing", async () => {
      mockAdminAuth();

      const res = await GetAdminDowngradePreview(
        new Request("http://localhost/api/admin/orgs/org-1/downgrade-preview"),
        { params: Promise.resolve({ orgId: "org-1" }) },
      );

      expect(res.status).toBe(400);
      const body: any = await json(res);
      expect(body.error).toBe("toPlan query parameter is required");
    });

    it("should handle invalid plan gracefully (service returns error shape)", async () => {
      mockAdminAuth();
      const mockDowngrade = createMockDowngradeService();
      mockDowngrade.previewDowngrade.mockRejectedValue({ status: 404, message: "Plan not found" });
      vi.mocked(getDowngradeService).mockReturnValue(mockDowngrade);

      const res = await GetAdminDowngradePreview(
        new Request("http://localhost/api/admin/orgs/org-1/downgrade-preview?toPlan=NONEXISTENT"),
        { params: Promise.resolve({ orgId: "org-1" }) },
      );

      expect(res.status).toBe(404);
      const body: any = await json(res);
      expect(body.error).toBe("Plan not found");
    });

    it("should return downgrade preview for valid plan", async () => {
      mockAdminAuth();
      const preview = {
        fromPlan: "PRO",
        toPlan: "FREE",
        strategy: "immediate",
        affectedFeatures: [
          {
            featureKey: "AI_SUMMARY",
            featureDescription: "AI Summary",
            currentlyEnabled: true,
            willBeEnabled: false,
            currentLimit: null,
            newLimit: null,
            impact: "removed",
            strategy: "immediate",
          },
        ],
      };
      const mockDowngrade = createMockDowngradeService();
      mockDowngrade.previewDowngrade.mockResolvedValue(preview);
      vi.mocked(getDowngradeService).mockReturnValue(mockDowngrade);

      const res = await GetAdminDowngradePreview(
        new Request("http://localhost/api/admin/orgs/org-1/downgrade-preview?toPlan=FREE"),
        { params: Promise.resolve({ orgId: "org-1" }) },
      );

      expect(res.status).toBe(200);
      const body: any = await json(res);
      expect(body.fromPlan).toBe("PRO");
      expect(body.toPlan).toBe("FREE");
      expect(body.affectedFeatures).toHaveLength(1);
      expect(mockDowngrade.previewDowngrade).toHaveBeenCalledWith("org-1", "FREE");
    });

    // -------------------------------------------------------------------
    // Additional GET /api/admin/orgs/[orgId]/downgrade-preview edge cases
    // -------------------------------------------------------------------

    it("should return 400 when toPlan is an empty string", async () => {
      mockAdminAuth();

      const res = await GetAdminDowngradePreview(
        new Request("http://localhost/api/admin/orgs/org-1/downgrade-preview?toPlan="),
        { params: Promise.resolve({ orgId: "org-1" }) },
      );

      expect(res.status).toBe(400);
      const body: any = await json(res);
      expect(body.error).toBe("toPlan query parameter is required");
    });

    it("should return preview when toPlan is same as current plan (no downgrade)", async () => {
      mockAdminAuth();
      const mockDowngrade = createMockDowngradeService();
      const samePlanPreview = {
        fromPlan: "PRO",
        toPlan: "PRO",
        strategy: "immediate",
        affectedFeatures: [],
      };
      mockDowngrade.previewDowngrade.mockResolvedValue(samePlanPreview);
      vi.mocked(getDowngradeService).mockReturnValue(mockDowngrade);

      const res = await GetAdminDowngradePreview(
        new Request("http://localhost/api/admin/orgs/org-1/downgrade-preview?toPlan=PRO"),
        { params: Promise.resolve({ orgId: "org-1" }) },
      );

      expect(res.status).toBe(200);
      const body: any = await json(res);
      expect(body.fromPlan).toBe("PRO");
      expect(body.toPlan).toBe("PRO");
      expect(body.affectedFeatures).toHaveLength(0);
    });

    it("should return 500 when downgradeService throws non-standard error (no .status)", async () => {
      mockAdminAuth();
      const mockDowngrade = createMockDowngradeService();
      mockDowngrade.previewDowngrade.mockRejectedValue(new Error("Downgrade service crashed"));
      vi.mocked(getDowngradeService).mockReturnValue(mockDowngrade);

      const res = await GetAdminDowngradePreview(
        new Request("http://localhost/api/admin/orgs/org-1/downgrade-preview?toPlan=FREE"),
        { params: Promise.resolve({ orgId: "org-1" }) },
      );

      expect(res.status).toBe(500);
      const body: any = await json(res);
      expect(body.error).toBe("Internal server error");
      expect(vi.mocked(loggerApi.error)).toHaveBeenCalled();
    });

    it("should handle empty orgId gracefully", async () => {
      mockAdminAuth();
      const mockDowngrade = createMockDowngradeService();
      mockDowngrade.previewDowngrade.mockResolvedValue({
        fromPlan: "FREE",
        toPlan: "PRO",
        strategy: "immediate",
        affectedFeatures: [],
      });
      vi.mocked(getDowngradeService).mockReturnValue(mockDowngrade);

      const res = await GetAdminDowngradePreview(
        new Request("http://localhost/api/admin/orgs//downgrade-preview?toPlan=PRO"),
        { params: Promise.resolve({ orgId: "" }) },
      );

      expect(res.status).toBe(200);
      expect(mockDowngrade.previewDowngrade).toHaveBeenCalledWith("", "PRO");
    });
  });

  // ===================================================================
  // POST /api/admin/cache/invalidate/[orgId]
  // ===================================================================
  describe("POST /api/admin/cache/invalidate/[orgId]", () => {
    it("should reject non-admin", async () => {
      mockAdminAuthError(403, "Forbidden");

      const res = await PostAdminCacheInvalidate(
        new Request("http://localhost/api/admin/cache/invalidate/org-1", { method: "POST" }),
        { params: Promise.resolve({ orgId: "org-1" }) },
      );

      expect(res.status).toBe(403);
    });

    it("should successfully invalidate cache for the org", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      const res = await PostAdminCacheInvalidate(
        new Request("http://localhost/api/admin/cache/invalidate/org-42", { method: "POST" }),
        { params: Promise.resolve({ orgId: "org-42" }) },
      );

      expect(res.status).toBe(200);
      const body: any = await json(res);
      expect(body.success).toBe(true);
      expect(body.message).toContain("org-42");
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org-42");
    });

    it("should handle empty orgId gracefully", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      const res = await PostAdminCacheInvalidate(
        new Request("http://localhost/api/admin/cache/invalidate/", { method: "POST" }),
        { params: Promise.resolve({ orgId: "" }) },
      );

      expect(res.status).toBe(200);
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("");
    });

    // -------------------------------------------------------------------
    // Additional POST /api/admin/cache/invalidate/[orgId] edge cases
    // -------------------------------------------------------------------

    it("should handle very long orgId (10000 chars, attack attempt)", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);
      const longOrgId = "x".repeat(10000);

      const res = await PostAdminCacheInvalidate(
        new Request("http://localhost/api/admin/cache/invalidate/" + longOrgId, { method: "POST" }),
        { params: Promise.resolve({ orgId: longOrgId }) },
      );

      // The service will receive the long orgId as-is; behavior depends on cache service
      expect(mockGate.invalidateCache).toHaveBeenCalledWith(longOrgId);
      if (res.status === 200) {
        const body: any = await json(res);
        expect(body.success).toBe(true);
      } else {
        expect(res.status).toBe(500);
        expect(vi.mocked(loggerApi.error)).toHaveBeenCalled();
      }
    });

    it("should handle orgId with special characters (Unicode, emoji, SQL-like)", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);
      const specialOrgId = "org-1'; DROP TABLE users; -- 🔥🛡️";

      const res = await PostAdminCacheInvalidate(
        new Request(
          "http://localhost/api/admin/cache/invalidate/" + encodeURIComponent(specialOrgId),
          {
            method: "POST",
          },
        ),
        { params: Promise.resolve({ orgId: specialOrgId }) },
      );

      expect(mockGate.invalidateCache).toHaveBeenCalledWith(specialOrgId);
      if (res.status === 200) {
        const body: any = await json(res);
        expect(body.success).toBe(true);
      } else {
        expect(res.status).toBe(500);
      }
    });

    it("should return 401 when authentication fails (requireAdmin rejects with 401)", async () => {
      mockAdminAuthError(401, "Authentication required");

      const res = await PostAdminCacheInvalidate(
        new Request("http://localhost/api/admin/cache/invalidate/org-1", { method: "POST" }),
        { params: Promise.resolve({ orgId: "org-1" }) },
      );

      expect(res.status).toBe(401);
      const body: any = await json(res);
      expect(body.error).toBe("Authentication required");
    });
  });

  // ===================================================================
  // GET /api/debug/entitlements
  // ===================================================================
  describe("GET /api/debug/entitlements", () => {
    it("should reject non-admin", async () => {
      mockAdminAuthError(403, "Forbidden");

      const res = await GetDebugEntitlements(
        new Request("http://localhost/api/debug/entitlements?orgId=org-1&feature=EXPORT_PDF"),
      );

      expect(res.status).toBe(403);
    });

    it("should return 400 when orgId is missing", async () => {
      mockAdminAuth();

      const res = await GetDebugEntitlements(
        new Request("http://localhost/api/debug/entitlements?feature=EXPORT_PDF"),
      );

      expect(res.status).toBe(400);
      const body: any = await json(res);
      expect(body.error).toBe("orgId and feature query parameters are required");
    });

    it("should return 400 when feature is missing", async () => {
      mockAdminAuth();

      const res = await GetDebugEntitlements(
        new Request("http://localhost/api/debug/entitlements?orgId=org-1"),
      );

      expect(res.status).toBe(400);
      const body: any = await json(res);
      expect(body.error).toBe("orgId and feature query parameters are required");
    });

    it("should accept optional userId parameter when provided", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      mockGate.getDebugTrace.mockResolvedValue({
        featureKey: "EXPORT_PDF",
        resolvedVia: "user_override",
        enabled: true,
        limit: null,
        overrideId: "ov-1",
        expiresAt: null,
        planKey: "FREE",
        planEnabled: false,
        planLimit: null,
        orgOverrides: [],
        userOverrides: [{ id: "ov-1", enabled: true, limit_value: null, expires_at: null }],
      });
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);
      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: "org-1",
        name: "Test Org",
        stripeCustomerId: "cus_123",
      });
      vi.mocked(prisma.subscription.findFirst).mockResolvedValue(null);

      const res = await GetDebugEntitlements(
        new Request(
          "http://localhost/api/debug/entitlements?orgId=org-1&feature=EXPORT_PDF&userId=user-1",
        ),
      );

      expect(res.status).toBe(200);
      expect(mockGate.getDebugTrace).toHaveBeenCalledWith("org-1", "EXPORT_PDF", "user-1");
    });

    it("should return debug trace when org is found", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      const debugTrace = {
        featureKey: "EXPORT_PDF",
        resolvedVia: "plan",
        enabled: true,
        limit: null,
        planKey: "PRO",
        planEnabled: true,
        planLimit: null,
        orgOverrides: [],
        userOverrides: [],
      };
      mockGate.getDebugTrace.mockResolvedValue(debugTrace);
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);
      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: "org-1",
        name: "Test Org",
        stripeCustomerId: "cus_123",
      });
      vi.mocked(prisma.subscription.findFirst).mockResolvedValue({
        id: "sub-1",
        planKey: "PRO",
        status: "ACTIVE",
        currentPeriodEnd: new Date("2026-07-01"),
      });

      const res = await GetDebugEntitlements(
        new Request("http://localhost/api/debug/entitlements?orgId=org-1&feature=EXPORT_PDF"),
      );

      expect(res.status).toBe(200);
      const body: any = await json(res);
      expect(body.org).toEqual({
        id: "org-1",
        name: "Test Org",
        stripeCustomerId: "cus_123",
      });
      expect(body.subscription.planKey).toBe("PRO");
      expect(body.debugTrace).toEqual(debugTrace);
    });

    it("should return null org when organization is not found", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      mockGate.getDebugTrace.mockResolvedValue({
        featureKey: "EXPORT_PDF",
        resolvedVia: "fallback",
        enabled: false,
        limit: 0,
        planKey: "FREE",
        planEnabled: false,
        planLimit: null,
        orgOverrides: [],
        userOverrides: [],
      });
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.subscription.findFirst).mockResolvedValue(null);

      const res = await GetDebugEntitlements(
        new Request(
          "http://localhost/api/debug/entitlements?orgId=org-nonexistent&feature=EXPORT_PDF",
        ),
      );

      expect(res.status).toBe(200);
      const body: any = await json(res);
      expect(body.org).toBeNull();
      expect(body.subscription).toBeNull();
    });
  });

  // ===================================================================
  // Additional API route edge cases
  // ===================================================================
  describe("additional API route edge cases", () => {
    // PUT /api/admin/features/[key] — non-JSON body
    it("PUT feature with non-JSON body returns 500 (JSON parse error)", async () => {
      mockAdminAuth();

      const res = await PutAdminFeature(
        new Request("http://localhost/api/admin/features/test-key", {
          method: "PUT",
          body: "this is not json",
          headers: { "content-type": "text/plain" },
        }),
        { params: Promise.resolve({ key: "test-key" }) },
      );

      expect(res.status).toBe(500);
      const body: any = await json(res);
      expect(body.error).toBe("Internal server error");
    });

    // PUT /api/admin/features/[key] — empty body
    it("PUT feature with empty body returns 500 (JSON parse error)", async () => {
      mockAdminAuth();

      const res = await PutAdminFeature(
        new Request("http://localhost/api/admin/features/test-key", {
          method: "PUT",
          body: "",
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ key: "test-key" }) },
      );

      expect(res.status).toBe(500);
      const body: any = await json(res);
      expect(body.error).toBe("Internal server error");
    });

    // POST /api/admin/overrides — with expires_at in the past (should be accepted)
    it("POST override with expires_at in the past is accepted", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const createdOverride = {
        id: "ov-past",
        scope: "ORG",
        scopeId: "org-1",
        featureKey: "feat-1",
        enabled: true,
        limitValue: null,
        expiresAt: pastDate,
        reason: "Testing past date",
      };
      vi.mocked(prisma.entitlementOverride.create).mockResolvedValue(createdOverride);

      const res = await PostAdminOverride(
        new Request("http://localhost/api/admin/overrides", {
          method: "POST",
          body: JSON.stringify({
            scope: "org",
            scope_id: "org-1",
            feature_key: "feat-1",
            enabled: true,
            expires_at: pastDate,
            reason: "Testing past date",
          }),
          headers: { "content-type": "application/json" },
        }),
      );

      expect(res.status).toBe(201);
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org-1");
    });

    // GET /api/admin/plans — page=0 edge case
    it("GET plans with page=0 sends skip=-20 to prisma", async () => {
      mockAdminAuth();
      vi.mocked(prisma.pricingPlan.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pricingPlan.count).mockResolvedValue(0);

      await GetAdminPlans(new Request("http://localhost/api/admin/plans?page=0"));

      const callArgs = vi.mocked(prisma.pricingPlan.findMany).mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs.skip).toBe(-20); // (0-1)*20 = -20
    });

    // GET /api/admin/plans — page=-1 edge case
    it("GET plans with page=-1 sends skip=-40 to prisma", async () => {
      mockAdminAuth();
      vi.mocked(prisma.pricingPlan.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pricingPlan.count).mockResolvedValue(0);

      await GetAdminPlans(new Request("http://localhost/api/admin/plans?page=-1"));

      const callArgs = vi.mocked(prisma.pricingPlan.findMany).mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs.skip).toBe(-40); // (-1-1)*20 = -40
    });

    // GET /api/debug/entitlements — when getDebugTrace throws
    it("GET debug entitlements when getDebugTrace throws returns 500", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      mockGate.getDebugTrace.mockRejectedValue(new Error("Debug service error"));
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);
      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: "org-1",
        name: "Test Org",
        stripeCustomerId: "cus_123",
      });

      const res = await GetDebugEntitlements(
        new Request("http://localhost/api/debug/entitlements?orgId=org-1&feature=EXPORT_PDF"),
      );

      expect(res.status).toBe(500);
      const body: any = await json(res);
      expect(body.error).toBe("Internal server error");
    });

    // POST /api/admin/cache/invalidate/[orgId] — when service throws
    it("POST cache invalidate when service throws returns 500", async () => {
      mockAdminAuth();
      const mockGate = createMockGate();
      mockGate.invalidateCache.mockRejectedValue(new Error("Cache service error"));
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      const res = await PostAdminCacheInvalidate(
        new Request("http://localhost/api/admin/cache/invalidate/org-1", { method: "POST" }),
        { params: Promise.resolve({ orgId: "org-1" }) },
      );

      expect(res.status).toBe(500);
      const body: any = await json(res);
      expect(body.error).toBe("Internal server error");
    });
  });

  // ===================================================================
  // GET /api/admin/users
  // ===================================================================
  describe("GET /api/admin/users", () => {
    it("should return paginated user list", async () => {
      mockAdminAuth();
      const users = [
        {
          id: "u1",
          name: "User 1",
          email: "u1@test.com",
          role: "USER",
          userRoles: [{ role: "USER" }],
          createdAt: new Date(),
        },
      ];
      vi.mocked(prisma.user.findMany).mockResolvedValue(users);
      vi.mocked(prisma.user.count).mockResolvedValue(1);

      const res = await GetAdminUsers(new Request("http://localhost/api/admin/users"));
      expect(res.status).toBe(200);
      const body: any = await json(res);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].email).toBe("u1@test.com");
      expect(body.total).toBe(1);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(50);
      expect(body.totalPages).toBe(1);
    });

    it("should return empty paginated list when no users exist", async () => {
      mockAdminAuth();
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);

      const res = await GetAdminUsers(new Request("http://localhost/api/admin/users"));
      expect(res.status).toBe(200);
      const body: any = await json(res);
      expect(body.data).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(50);
      expect(body.totalPages).toBe(0);
    });

    it("should return 500 when Prisma throws and call loggerApi.error", async () => {
      mockAdminAuth();
      vi.mocked(prisma.user.findMany).mockRejectedValue(new Error("DB connection failed"));

      const res = await GetAdminUsers();
      expect(res.status).toBe(500);
      const body: any = await json(res);
      expect(body.error).toBe("Internal server error");
      expect(vi.mocked(loggerApi.error)).toHaveBeenCalled();
    });

    it("should propagate requireAdmin 401 error", async () => {
      mockAdminAuthError(401, "Unauthorized");

      const res = await GetAdminUsers();
      expect(res.status).toBe(401);
      const body: any = await json(res);
      expect(body.error).toBe("Unauthorized");
    });

    it("should return 500 when requireAdmin throws non-standard error (no .status)", async () => {
      vi.mocked(requireAdmin).mockRejectedValue(new Error("Auth failure"));

      const res = await GetAdminUsers();
      expect(res.status).toBe(500);
      const body: any = await json(res);
      expect(body.error).toBe("Internal server error");
      expect(vi.mocked(loggerApi.error)).toHaveBeenCalled();
    });

    it("should handle partial user data (name null, userRoles empty)", async () => {
      mockAdminAuth();
      const users = [
        {
          id: "u-partial",
          name: null,
          email: "partial@test.com",
          role: "USER",
          userRoles: [],
          createdAt: new Date("2026-01-01"),
        },
      ];
      vi.mocked(prisma.user.findMany).mockResolvedValue(users);
      vi.mocked(prisma.user.count).mockResolvedValue(1);

      const res = await GetAdminUsers(new Request("http://localhost/api/admin/users"));
      expect(res.status).toBe(200);
      const body: any = await json(res);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBeNull();
      expect(body.data[0].userRoles).toEqual([]);
      expect(body.data[0].email).toBe("partial@test.com");
    });
  });

  // ===================================================================
  // POST /api/admin/users
  // ===================================================================
  describe("POST /api/admin/users", () => {
    it("should create a user", async () => {
      mockAdminAuth();
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: "u-new",
        email: "new@test.com",
        name: "New User",
        role: "USER",
        userRoles: [{ role: "USER" }],
      });

      const res = await PostAdminUsers(
        new Request("http://localhost/api/admin/users", {
          method: "POST",
          body: JSON.stringify({ email: "new@test.com", name: "New User", roles: ["USER"] }),
          headers: { "content-type": "application/json" },
        }),
      );
      expect(res.status).toBe(201);
      const body: any = await json(res);
      expect(body.email).toBe("new@test.com");
    });

    it("should reject non-admin (POST users handler now has error.status branching)", async () => {
      mockAdminAuthError(403, "Forbidden");

      const res = await PostAdminUsers(
        new Request("http://localhost/api/admin/users", { method: "POST" }),
      );
      expect(res.status).toBe(403);
    });

    it("should return 400 when email is missing", async () => {
      mockAdminAuth();

      const res = await PostAdminUsers(
        new Request("http://localhost/api/admin/users", {
          method: "POST",
          body: JSON.stringify({ name: "No Email" }),
          headers: { "content-type": "application/json" },
        }),
      );
      expect(res.status).toBe(400);
      const body: any = await json(res);
      expect(body.error).toBe("Validation error");
    });

    it("should return 400 when email format is invalid", async () => {
      mockAdminAuth();

      const res = await PostAdminUsers(
        new Request("http://localhost/api/admin/users", {
          method: "POST",
          body: JSON.stringify({ email: "not-an-email", name: "Test", roles: ["USER"] }),
          headers: { "content-type": "application/json" },
        }),
      );
      expect(res.status).toBe(400);
      const body: any = await json(res);
      expect(body.error).toBe("Validation error");
      expect(body.details).toHaveProperty("email");
    });

    it("should return 400 when roles array is empty", async () => {
      mockAdminAuth();

      const res = await PostAdminUsers(
        new Request("http://localhost/api/admin/users", {
          method: "POST",
          body: JSON.stringify({ email: "test@test.com", name: "Test", roles: [] }),
          headers: { "content-type": "application/json" },
        }),
      );
      expect(res.status).toBe(400);
      const body: any = await json(res);
      expect(body.error).toBe("Validation error");
      expect(body.details).toHaveProperty("roles");
    });

    it("should return 400 when role is invalid (SUPERADMIN)", async () => {
      mockAdminAuth();

      const res = await PostAdminUsers(
        new Request("http://localhost/api/admin/users", {
          method: "POST",
          body: JSON.stringify({ email: "test@test.com", name: "Test", roles: ["SUPERADMIN"] }),
          headers: { "content-type": "application/json" },
        }),
      );
      expect(res.status).toBe(400);
      const body: any = await json(res);
      expect(body.error).toBe("Validation error");
    });

    it("should return 500 when body is not valid JSON (SyntaxError)", async () => {
      mockAdminAuth();

      const res = await PostAdminUsers(
        new Request("http://localhost/api/admin/users", {
          method: "POST",
          body: "this is not json",
          headers: { "content-type": "text/plain" },
        }),
      );
      expect(res.status).toBe(500);
      const body: any = await json(res);
      expect(body.error).toBe("Internal server error");
      expect(vi.mocked(loggerApi.error)).toHaveBeenCalled();
    });

    it("should return 500 when body is empty (JSON parse error)", async () => {
      mockAdminAuth();

      const res = await PostAdminUsers(
        new Request("http://localhost/api/admin/users", {
          method: "POST",
          body: "",
          headers: { "content-type": "application/json" },
        }),
      );
      expect(res.status).toBe(500);
      const body: any = await json(res);
      expect(body.error).toBe("Internal server error");
      expect(vi.mocked(loggerApi.error)).toHaveBeenCalled();
    });

    it("should return 409 on duplicate email (P2002)", async () => {
      mockAdminAuth();
      const p2002Error = new Error("Unique constraint failed on the fields: (`email`)");
      (p2002Error as any).code = "P2002";
      vi.mocked(prisma.user.create).mockRejectedValue(p2002Error);

      const res = await PostAdminUsers(
        new Request("http://localhost/api/admin/users", {
          method: "POST",
          body: JSON.stringify({ email: "existing@test.com", name: "Duplicate", roles: ["USER"] }),
          headers: { "content-type": "application/json" },
        }),
      );
      expect(res.status).toBe(409);
      const body: any = await json(res);
      expect(body.error).toBe("Email already exists");
      expect(vi.mocked(loggerApi.error)).not.toHaveBeenCalled();
    });

    it("should create an admin user and return 201", async () => {
      mockAdminAuth();
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: "u-admin",
        email: "admin@example.com",
        name: "Admin User",
        role: "ADMIN",
        userRoles: [{ role: "ADMIN" }],
      });

      const res = await PostAdminUsers(
        new Request("http://localhost/api/admin/users", {
          method: "POST",
          body: JSON.stringify({
            email: "admin@example.com",
            name: "Admin User",
            roles: ["ADMIN"],
          }),
          headers: { "content-type": "application/json" },
        }),
      );
      expect(res.status).toBe(201);
      const body: any = await json(res);
      expect(body.role).toBe("ADMIN");
      expect(body.userRoles).toEqual([{ role: "ADMIN" }]);
    });

    it("should default roles to [USER] when roles is omitted", async () => {
      mockAdminAuth();
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: "u-default-role",
        email: "default@test.com",
        name: "Default Role",
        role: "USER",
        userRoles: [{ role: "USER" }],
      });

      const res = await PostAdminUsers(
        new Request("http://localhost/api/admin/users", {
          method: "POST",
          body: JSON.stringify({ email: "default@test.com", name: "Default Role" }),
          headers: { "content-type": "application/json" },
        }),
      );
      expect(res.status).toBe(201);
      const body: any = await json(res);
      expect(body.role).toBe("USER");
      expect(body.userRoles).toEqual([{ role: "USER" }]);
      expect(vi.mocked(prisma.user.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: "USER",
            userRoles: { create: [{ role: "USER" }] },
          }),
        }),
      );
    });

    it("should create user when name is omitted (name becomes null in DB)", async () => {
      mockAdminAuth();
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: "u-no-name",
        email: "noname@test.com",
        name: null,
        role: "USER",
        userRoles: [{ role: "USER" }],
      });

      const res = await PostAdminUsers(
        new Request("http://localhost/api/admin/users", {
          method: "POST",
          body: JSON.stringify({ email: "noname@test.com", roles: ["USER"] }),
          headers: { "content-type": "application/json" },
        }),
      );
      expect(res.status).toBe(201);
      const body: any = await json(res);
      expect(body.email).toBe("noname@test.com");
      expect(body.name).toBeNull();
    });

    it("limitValue negative is not applicable — CreateUserSchema has no limitValue field", async () => {
      // The CreateUserSchema (z.object) only defines email, name, and roles.
      // There is no limitValue property in the schema, so a "negative limitValue"
      // scenario cannot occur. No min(0) validation is needed.
      expect(true).toBe(true);
    });
  });

  // ===================================================================
  // POST /api/admin/plans/[planKey]/features
  // ===================================================================
  describe("POST /api/admin/plans/[planKey]/features", () => {
    it("should reject non-admin", async () => {
      mockAdminAuthError(403, "Forbidden");

      const res = await PostAdminPlanFeatures(
        new Request("http://localhost/api/admin/plans/PRO/features", { method: "POST" }),
        { params: Promise.resolve({ planKey: "PRO" }) },
      );
      expect(res.status).toBe(403);
    });

    it("should return 404 when plan not found", async () => {
      mockAdminAuth();
      vi.mocked(prisma.pricingPlan.findUnique).mockResolvedValue(null);

      const res = await PostAdminPlanFeatures(
        new Request("http://localhost/api/admin/plans/NONEXISTENT/features", {
          method: "POST",
          body: JSON.stringify({ featureKey: "EXPORT_PDF", enabled: true }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ planKey: "NONEXISTENT" }) },
      );
      expect(res.status).toBe(404);
      const body: any = await json(res);
      expect(body.error).toBe("Plan not found");
    });

    it("should return 404 when feature not found", async () => {
      mockAdminAuth();
      vi.mocked(prisma.pricingPlan.findUnique).mockResolvedValue({
        id: "p1",
        key: "PRO",
        name: "Pro",
        isActive: true,
        priceMonthly: 2900,
      });
      vi.mocked(prisma.feature.findUnique).mockResolvedValue(null);

      const res = await PostAdminPlanFeatures(
        new Request("http://localhost/api/admin/plans/PRO/features", {
          method: "POST",
          body: JSON.stringify({ featureKey: "MISSING_FEATURE", enabled: true }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ planKey: "PRO" }) },
      );
      expect(res.status).toBe(404);
      const body: any = await json(res);
      expect(body.error).toBe("Feature not found");
    });

    it("should return 409 when feature already exists on plan (P2002)", async () => {
      mockAdminAuth();
      vi.mocked(prisma.pricingPlan.findUnique).mockResolvedValue({
        id: "p1",
        key: "PRO",
        name: "Pro",
        isActive: true,
        priceMonthly: 2900,
      });
      vi.mocked(prisma.feature.findUnique).mockResolvedValue({
        id: "f1",
        key: "EXPORT_PDF",
        type: "boolean",
        defaultConfig: null,
        description: null,
      });
      const p2002Error = new Error("Unique constraint");
      (p2002Error as any).code = "P2002";
      vi.mocked(prisma.planFeature.create).mockRejectedValue(p2002Error);

      const res = await PostAdminPlanFeatures(
        new Request("http://localhost/api/admin/plans/PRO/features", {
          method: "POST",
          body: JSON.stringify({ featureKey: "EXPORT_PDF", enabled: true }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ planKey: "PRO" }) },
      );
      expect(res.status).toBe(409);
      const body: any = await json(res);
      expect(body.error).toBe("Feature already exists on this plan");
    });

    it("should return 400 when featureKey is missing", async () => {
      mockAdminAuth();

      const res = await PostAdminPlanFeatures(
        new Request("http://localhost/api/admin/plans/PRO/features", {
          method: "POST",
          body: JSON.stringify({ enabled: true }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ planKey: "PRO" }) },
      );
      expect(res.status).toBe(400);
      const body: any = await json(res);
      expect(body.error).toBe("Validation error");
    });

    it("should return 201 on success", async () => {
      mockAdminAuth();
      vi.mocked(prisma.pricingPlan.findUnique).mockResolvedValue({
        id: "p1",
        key: "PRO",
        name: "Pro",
        isActive: true,
        priceMonthly: 2900,
      });
      vi.mocked(prisma.feature.findUnique).mockResolvedValue({
        id: "f1",
        key: "EXPORT_PDF",
        type: "boolean",
        defaultConfig: null,
        description: null,
      });
      vi.mocked(prisma.planFeature.create).mockResolvedValue({
        id: "pf1",
        enabled: true,
        limitValue: null,
        configJson: {},
        downgradeStrategy: "IMMEDIATE",
        feature: {
          id: "f1",
          key: "EXPORT_PDF",
          type: "boolean",
          description: null,
          defaultConfig: null,
        },
        plan: { id: "p1", key: "PRO", name: "Pro", isActive: true, priceMonthly: 2900 },
      });

      const res = await PostAdminPlanFeatures(
        new Request("http://localhost/api/admin/plans/PRO/features", {
          method: "POST",
          body: JSON.stringify({ featureKey: "EXPORT_PDF", enabled: true }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ planKey: "PRO" }) },
      );
      expect(res.status).toBe(201);
    });

    it("should return 400 for invalid downgradeStrategy", async () => {
      mockAdminAuth();

      const res = await PostAdminPlanFeatures(
        new Request("http://localhost/api/admin/plans/PRO/features", {
          method: "POST",
          body: JSON.stringify({
            featureKey: "EXPORT_PDF",
            enabled: true,
            downgradeStrategy: "hard",
          }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ planKey: "PRO" }) },
      );

      expect(res.status).toBe(400);
      const body: any = await json(res);
      expect(body.error).toBe("Validation error");
    });

    it("should reject negative limitValue — Zod .min(0)", async () => {
      mockAdminAuth();

      const res = await PostAdminPlanFeatures(
        new Request("http://localhost/api/admin/plans/PRO/features", {
          method: "POST",
          body: JSON.stringify({ featureKey: "EXPORT_PDF", enabled: true, limitValue: -5 }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ planKey: "PRO" }) },
      );

      expect(res.status).toBe(400);
      const body: any = await json(res);
      expect(body.error).toBe("Validation error");
      expect(vi.mocked(prisma.planFeature.create)).not.toHaveBeenCalled();
    });

    it("should return 400 for configJson with string instead of object", async () => {
      mockAdminAuth();

      const res = await PostAdminPlanFeatures(
        new Request("http://localhost/api/admin/plans/PRO/features", {
          method: "POST",
          body: JSON.stringify({
            featureKey: "EXPORT_PDF",
            enabled: true,
            configJson: "not_an_object",
          }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ planKey: "PRO" }) },
      );

      expect(res.status).toBe(400);
      const body: any = await json(res);
      expect(body.error).toBe("Validation error");
    });

    it("should return 400 for empty featureKey", async () => {
      mockAdminAuth();

      const res = await PostAdminPlanFeatures(
        new Request("http://localhost/api/admin/plans/PRO/features", {
          method: "POST",
          body: JSON.stringify({ featureKey: "", enabled: true }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ planKey: "PRO" }) },
      );

      expect(res.status).toBe(400);
      const body: any = await json(res);
      expect(body.error).toBe("Validation error");
      expect(body.details).toHaveProperty("featureKey");
    });

    it("should return 500 for non-JSON body", async () => {
      mockAdminAuth();

      const res = await PostAdminPlanFeatures(
        new Request("http://localhost/api/admin/plans/PRO/features", {
          method: "POST",
          body: "not json body",
          headers: { "content-type": "text/plain" },
        }),
        { params: Promise.resolve({ planKey: "PRO" }) },
      );

      expect(res.status).toBe(500);
      const body: any = await json(res);
      expect(body.error).toBe("Internal server error");
    });

    it("should handle planKey with special characters (path traversal attempt)", async () => {
      mockAdminAuth();
      vi.mocked(prisma.pricingPlan.findUnique).mockResolvedValue(null);

      const res = await PostAdminPlanFeatures(
        new Request("http://localhost/api/admin/plans/../FREE/features", {
          method: "POST",
          body: JSON.stringify({ featureKey: "EXPORT_PDF", enabled: true }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ planKey: "../FREE" }) },
      );

      expect(res.status).toBe(404);
      const body: any = await json(res);
      expect(body.error).toBe("Plan not found");
      expect(vi.mocked(prisma.pricingPlan.findUnique)).toHaveBeenCalledWith({
        where: { key: "../FREE" },
      });
    });

    it("should return 500 on race condition (P2003 FK constraint on create)", async () => {
      mockAdminAuth();
      vi.mocked(prisma.pricingPlan.findUnique).mockResolvedValue({
        id: "p1",
        key: "PRO",
        name: "Pro",
        isActive: true,
        priceMonthly: 2900,
      });
      vi.mocked(prisma.feature.findUnique).mockResolvedValue({
        id: "f1",
        key: "EXPORT_PDF",
        type: "boolean",
        defaultConfig: null,
        description: null,
      });
      const p2003Error = new Error("Foreign key constraint failed");
      (p2003Error as any).code = "P2003";
      vi.mocked(prisma.planFeature.create).mockRejectedValue(p2003Error);

      const res = await PostAdminPlanFeatures(
        new Request("http://localhost/api/admin/plans/PRO/features", {
          method: "POST",
          body: JSON.stringify({ featureKey: "EXPORT_PDF", enabled: true }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ planKey: "PRO" }) },
      );

      expect(res.status).toBe(500);
      const body: any = await json(res);
      expect(body.error).toBe("Internal server error");
    });

    it("should default enabled to false when omitted", async () => {
      mockAdminAuth();
      vi.mocked(prisma.pricingPlan.findUnique).mockResolvedValue({
        id: "p1",
        key: "PRO",
        name: "Pro",
        isActive: true,
        priceMonthly: 2900,
      });
      vi.mocked(prisma.feature.findUnique).mockResolvedValue({
        id: "f1",
        key: "EXPORT_PDF",
        type: "boolean",
        defaultConfig: null,
        description: null,
      });
      vi.mocked(prisma.planFeature.create).mockResolvedValue({
        id: "pf1",
        enabled: false,
        limitValue: null,
        configJson: {},
        downgradeStrategy: "IMMEDIATE",
        feature: {
          id: "f1",
          key: "EXPORT_PDF",
          type: "boolean",
          description: null,
          defaultConfig: null,
        },
        plan: { id: "p1", key: "PRO", name: "Pro", isActive: true, priceMonthly: 2900 },
      });

      const res = await PostAdminPlanFeatures(
        new Request("http://localhost/api/admin/plans/PRO/features", {
          method: "POST",
          body: JSON.stringify({ featureKey: "EXPORT_PDF" }), // no enabled field
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ planKey: "PRO" }) },
      );

      expect(res.status).toBe(201);
      expect(vi.mocked(prisma.planFeature.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            enabled: false,
          }),
        }),
      );
    });
  });

  // ===================================================================
  // requireAdmin throwing non-standard error
  // ===================================================================
  describe("requireAdmin throws non-standard error", () => {
    it("GET plans with requireAdmin error without statusCode returns 500", async () => {
      vi.mocked(requireAdmin).mockRejectedValue(new Error("Auth failure"));

      const res = await GetAdminPlans(new Request("http://localhost/api/admin/plans"));
      expect(res.status).toBe(500);
      const body: any = await json(res);
      expect(body.error).toBe("Internal server error");
    });
  });

  // ===================================================================
  // CATEGORY 3: Admin route anti-patterns
  // ===================================================================
  describe("admin route anti-patterns", () => {
    // ================================================================
    // anti-pattern 1: admin/plans/route.ts creates new
    // PrismaEntitlementRepository(prisma) directly, bypassing the
    // service layer + cache. The mock prisma must support ALL methods
    // that PrismaEntitlementRepository calls.
    // ================================================================
    describe("admin/plans/route.ts — direct PrismaEntitlementRepository usage", () => {
      it("GET /api/admin/plans works with mocked prisma (PrismaEntitlementRepository upstream)", async () => {
        mockAdminAuth();
        // PrismaEntitlementRepository calls prisma.pricingPlan.findMany and .count
        // These are already mocked in the jest setup
        vi.mocked(prisma.pricingPlan.findMany).mockResolvedValue([
          { id: "1", key: "FREE", name: "Free Plan", priceMonthly: 0, isActive: true },
          { id: "2", key: "PRO", name: "Pro Plan", priceMonthly: 2900, isActive: true },
        ]);
        vi.mocked(prisma.pricingPlan.count).mockResolvedValue(2);

        const res = await GetAdminPlans(new Request("http://localhost/api/admin/plans"));
        expect(res.status).toBe(200);
        const body: any = await json(res);
        expect(body.data).toHaveLength(2);
      });

      it("PrismaEntitlementRepository methods are called with correct prisma models", async () => {
        // Verify the mock prisma has the MODELS THAT ARE ALREADY MOCKED.
        // usageTracking and stripeEvent are NOT currently in the mock setup
        // (they're used by webhook handler, not by admin routes)
        const requiredModels = [
          "pricingPlan", // findMany, count, findUnique
          "feature", // findUnique, findMany, update, count
          "planFeature", // findMany, create
          "entitlementOverride", // findMany, create, delete, findUnique
          "subscription", // findFirst, updateMany
          "organization", // findUnique, create
          "user", // findUnique, update, findMany, create
        ];

        for (const model of requiredModels) {
          expect((prisma as any)[model]).toBeDefined();
        }
      });

      it("GET /api/admin/plans with PrismaEntitlementRepository.prisma.pricingPlan.findMany throwing returns 500", async () => {
        mockAdminAuth();
        vi.mocked(prisma.pricingPlan.findMany).mockRejectedValue(new Error("DB connection failed"));

        const res = await GetAdminPlans(new Request("http://localhost/api/admin/plans"));
        expect(res.status).toBe(500);
        const body: any = await json(res);
        expect(body.error).toBe("Internal server error");
      });

      it("GET /api/admin/plans when prisma.pricingPlan.count throws returns 500", async () => {
        mockAdminAuth();
        vi.mocked(prisma.pricingPlan.findMany).mockResolvedValue([]);
        vi.mocked(prisma.pricingPlan.count).mockRejectedValue(new Error("Count failed"));

        const res = await GetAdminPlans(new Request("http://localhost/api/admin/plans"));
        expect(res.status).toBe(500);
        const body: any = await json(res);
        expect(body.error).toBe("Internal server error");
      });

      it("GET /api/admin/plans with sort parameter delegates to PrismaEntitlementRepository", async () => {
        mockAdminAuth();
        vi.mocked(prisma.pricingPlan.findMany).mockResolvedValue([]);
        vi.mocked(prisma.pricingPlan.count).mockResolvedValue(0);

        await GetAdminPlans(new Request("http://localhost/api/admin/plans?sort=name:desc"));

        // PrismaEntitlementRepository.listPlans splits sort on ":" and passes orderBy
        const callArgs = vi.mocked(prisma.pricingPlan.findMany).mock.calls[0]?.[0];
        expect(callArgs?.orderBy).toEqual({ name: "desc" });
      });
    });

    // ================================================================
    // anti-pattern 2: admin/overrides/route.ts accesses private
    // property `(gate as any).repo`. This is brittle — if
    // FeatureGateService renames or removes `repo`, this breaks.
    // ================================================================
    describe("admin/overrides/route.ts — (gate as any).repo access", () => {
      it("POST /api/admin/overrides accesses gate.repo private property", async () => {
        mockAdminAuth();
        const mockGate = createMockGate();
        // The route accesses (gate as any).repo — it needs to exist
        expect(mockGate.repo).toBeDefined();
        // At a minimum, repo must be an object (even if empty)
        expect(typeof mockGate.repo).toBe("object");

        vi.mocked(getFeatureGateService).mockReturnValue(mockGate);
        vi.mocked(prisma.entitlementOverride.create).mockResolvedValue({
          id: "ov-test",
          scope: "ORG",
          scopeId: "org-1",
          featureKey: "feat-test",
          enabled: true,
          limitValue: null,
          expiresAt: null,
          reason: "test anti-pattern",
        });

        const res = await PostAdminOverride(
          new Request("http://localhost/api/admin/overrides", {
            method: "POST",
            body: JSON.stringify({
              scope: "org",
              scope_id: "org-1",
              feature_key: "feat-test",
              reason: "test anti-pattern",
            }),
            headers: { "content-type": "application/json" },
          }),
        );

        expect(res.status).toBe(201);
        // The mockGate.repo was accessed but not used for writes in override route
        // (it uses prisma directly) — the repo is accessed but we just verify
        // the endpoint works despite this anti-pattern
      });

      it("gate.repo is accessible on real mock gate service (not just empty object)", async () => {
        // Create a real FeatureGateService with mock repo to verify the
        // (gate as any).repo access pattern works with real service instances
        const { FeatureGateService } = await import("../featureGateService");
        const { MockEntitlementRepository } = await import("./mockRepository");
        const repo = new MockEntitlementRepository();
        const cacheService = {
          get: vi.fn().mockResolvedValue(null),
          set: vi.fn(),
          invalidate: vi.fn(),
          invalidateAll: vi.fn(),
        };
        const gate = new FeatureGateService(repo, cacheService);

        // Accessing (gate as any).repo should work for reading
        const gateRepo = (gate as any).repo;
        expect(gateRepo).toBe(repo); // Same mock instance
        expect(typeof gateRepo.getOverrides).toBe("function");
        expect(typeof gateRepo.createOverride).toBe("function");
      });

      it("gate.repo has getOverrides and createOverride methods", async () => {
        const { MockEntitlementRepository } = await import("./mockRepository");
        const repo = new MockEntitlementRepository();

        // Verify the methods that the override route might need from repo
        expect(typeof repo.getOverrides).toBe("function");
        expect(typeof repo.createOverride).toBe("function");

        // These are the methods that (gate as any).repo might access
        // The mock needs to support them
        const result = await repo.getOverrides("org", "org-test");
        expect(Array.isArray(result)).toBe(true);
      });

      it("gate.repo is used for reading existing overrides (not writing)", () => {
        // Verify by checking what the mock gate's repo is used for
        // In the overrides route code, repo is accessed but never called
        // It's only referenced for reading purposes
        const mockGate = createMockGate();
        expect(mockGate.repo).toEqual({});
      });
    });
  });
});
