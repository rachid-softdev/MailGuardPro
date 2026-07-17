// ================================================================
// DowngradeService — Polish tests (follow-up to PR #142)
// Covers:
//   FIX 1b — executeDowngrade does NOT create duplicate overrides for
//            the same feature when invoked more than once for an org.
// ================================================================

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DowngradeService } from "@/services/feature-flags/downgradeService";

const repoMock: any = {
  getActiveSubscription: vi.fn(),
  getPlanFeatures: vi.fn(),
  getOverrides: vi.fn(),
  createOverride: vi.fn(),
};

const cacheMock: any = {
  invalidate: vi.fn().mockResolvedValue(undefined),
};

function makePlanFeature(
  featureKey: string,
  strategy: string,
  enabled = true,
  limit: number | null = 100,
) {
  return {
    feature_key: featureKey,
    feature_type: "limit" as any,
    feature_description: featureKey,
    feature_default_config: null,
    enabled,
    limit_value: limit,
    config_json: null,
    downgrade_strategy: strategy as any,
  };
}

function makeOverride(featureKey: string, expires_at: Date | null) {
  return {
    id: `ov_${featureKey}`,
    scope: "org" as const,
    scope_id: "org_1",
    feature_key: featureKey,
    enabled: true,
    limit_value: 0,
    expires_at,
    reason: "previous downgrade",
  };
}

let service: DowngradeService;

beforeAll(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
});

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.getActiveSubscription.mockResolvedValue({
    org_id: "org_1",
    plan_key: "PRO",
    status: "active",
    stripe_sub_id: "sub_1",
  });
  // PRO has two features that need freezing on downgrade to FREE.
  repoMock.getPlanFeatures.mockImplementation((planKey: string) => {
    if (planKey === "PRO") {
      return Promise.resolve([
        makePlanFeature("FEATURE_A", "freeze"),
        makePlanFeature("FEATURE_B", "graceful"),
      ]);
    }
    return Promise.resolve([]); // FREE has no features
  });
  repoMock.getOverrides.mockResolvedValue([]); // no existing overrides initially
  repoMock.createOverride.mockResolvedValue({});

  service = new DowngradeService(repoMock, cacheMock);
});

describe("FIX 1b — executeDowngrade dedupes overrides on repeat calls", () => {
  it("creates one override per feature on the first call", async () => {
    await service.executeDowngrade("org_1", "FREE", null);

    expect(repoMock.createOverride).toHaveBeenCalledTimes(2);
    expect(repoMock.createOverride).toHaveBeenCalledWith(
      expect.objectContaining({ feature_key: "FEATURE_A", scope: "org" }),
    );
    expect(repoMock.createOverride).toHaveBeenCalledWith(
      expect.objectContaining({ feature_key: "FEATURE_B", scope: "org" }),
    );
  });

  it("does NOT create duplicate overrides on a second call", async () => {
    // Existing active overrides already cover both features.
    repoMock.getOverrides.mockResolvedValue([
      makeOverride("FEATURE_A", null),
      makeOverride("FEATURE_B", null),
    ]);

    await service.executeDowngrade("org_1", "FREE", null);

    expect(repoMock.createOverride).not.toHaveBeenCalled();
  });

  it("skips only features that already have an active override", async () => {
    // FEATURE_A already overridden (active); FEATURE_B not.
    repoMock.getOverrides.mockResolvedValue([makeOverride("FEATURE_A", null)]);

    await service.executeDowngrade("org_1", "FREE", null);

    expect(repoMock.createOverride).toHaveBeenCalledTimes(1);
    expect(repoMock.createOverride).toHaveBeenCalledWith(
      expect.objectContaining({ feature_key: "FEATURE_B" }),
    );
    expect(repoMock.createOverride).not.toHaveBeenCalledWith(
      expect.objectContaining({ feature_key: "FEATURE_A" }),
    );
  });

  it("treats expired overrides as reusable (creates a fresh one)", async () => {
    // Existing override for FEATURE_A is expired → should create a fresh one.
    repoMock.getOverrides.mockResolvedValue([
      makeOverride("FEATURE_A", new Date(Date.now() - 60_000)),
    ]);

    await service.executeDowngrade("org_1", "FREE", null);

    expect(repoMock.createOverride).toHaveBeenCalledWith(
      expect.objectContaining({ feature_key: "FEATURE_A" }),
    );
  });
});
