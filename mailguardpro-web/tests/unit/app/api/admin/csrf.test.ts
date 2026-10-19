/**
 * CSRF enforcement on admin mutation routes (audit O1).
 *
 * Every mutating /api/admin/* handler must run validateCsrfOrigin
 * (Origin/Referer check) before authentication and business logic —
 * defense-in-depth on top of SameSite=Lax session cookies.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCsrf, mockLoggerApi, mockGate } = vi.hoisted(() => ({
  mockCsrf: vi.fn(() => ({ valid: true, error: undefined as string | undefined })),
  mockLoggerApi: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  mockGate: { invalidateCache: vi.fn(), getAllEntitlements: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: mockCsrf }));
vi.mock("@/lib/logger", () => ({ loggerApi: mockLoggerApi }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    entitlementOverride: { create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    feature: { update: vi.fn() },
    pricingPlan: { findUnique: vi.fn() },
    planFeature: { create: vi.fn() },
  },
}));
vi.mock("@/services/feature-flags/serviceFactory", () => ({
  getFeatureGateService: vi.fn(() => mockGate),
}));

import { POST as postCacheInvalidate } from "@/app/api/admin/cache/invalidate/[orgId]/route";
import { PUT as putFeature } from "@/app/api/admin/features/[key]/route";
import { DELETE as deleteOverride } from "@/app/api/admin/overrides/[id]/route";
import { POST as postOverride } from "@/app/api/admin/overrides/route";
import { POST as postPlanFeatures } from "@/app/api/admin/plans/[planKey]/features/route";
import { POST as postUsers } from "@/app/api/admin/users/route";

const VALID_CSRF = { valid: true, error: undefined as string | undefined };
const INVALID_CSRF = { valid: false, error: "Missing Origin and Referer headers" };

function nextRequest(path: string, method: string) {
  return new NextRequest(`http://localhost${path}`, { method });
}

const ROUTES = [
  {
    name: "POST /api/admin/users",
    invoke: () => postUsers(nextRequest("/api/admin/users", "POST")),
  },
  {
    name: "POST /api/admin/overrides",
    invoke: () => postOverride(nextRequest("/api/admin/overrides", "POST")),
  },
  {
    name: "DELETE /api/admin/overrides/[id]",
    invoke: () =>
      deleteOverride(nextRequest("/api/admin/overrides/ov-1", "DELETE"), {
        params: Promise.resolve({ id: "ov-1" }),
      }),
  },
  {
    name: "POST /api/admin/cache/invalidate/[orgId]",
    invoke: () =>
      postCacheInvalidate(nextRequest("/api/admin/cache/invalidate/org-1", "POST"), {
        params: Promise.resolve({ orgId: "org-1" }),
      }),
  },
  {
    name: "PUT /api/admin/features/[key]",
    invoke: () =>
      putFeature(nextRequest("/api/admin/features/FEATURE_KEY", "PUT"), {
        params: Promise.resolve({ key: "FEATURE_KEY" }),
      }),
  },
  {
    name: "POST /api/admin/plans/[planKey]/features",
    invoke: () =>
      postPlanFeatures(nextRequest("/api/admin/plans/FREE/features", "POST"), {
        params: Promise.resolve({ planKey: "FREE" }),
      }),
  },
];

describe("admin mutation routes — CSRF enforcement (audit O1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCsrf.mockReturnValue(VALID_CSRF);
  });

  it.each(ROUTES)("$name returns 403 when the CSRF origin is invalid", async ({ invoke }) => {
    mockCsrf.mockReturnValue(INVALID_CSRF);
    const res = await invoke();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe(INVALID_CSRF.error);
  });

  it.each(ROUTES)("$name checks CSRF before auth (401 without a session)", async ({ invoke }) => {
    const res = await invoke();
    expect(res.status).toBe(401);
    expect(mockCsrf).toHaveBeenCalledTimes(1);
  });
});
