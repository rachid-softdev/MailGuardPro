// ================================================================
// Plan Feature Matrix — Full Verification
// ================================================================
// Verifies the complete plan × feature matrix from the shared source
// of truth (planMatrix.ts):
//   1. Each plan has exactly the features granted in PLAN_FEATURE_MAP
//   2. Lower plans CANNOT access features not granted to them
//      (hasFeature=false, assertFeature throws, limit blocked)
//   3. The highest plan (BUSINESS) can access EVERY feature, including
//      features that are not explicitly mapped to it
//   4. getAllEntitlements exposes the same matrix to the frontend
// ================================================================

import { describe, expect, it } from "vitest";
import type { ICacheService } from "../cacheService";
import { FeatureGateService } from "../featureGateService";
import { FEATURES, getPlanRank, getTopPlanKey, PLAN_FEATURE_MAP, PLANS } from "../planMatrix";
import { FeatureNotAvailableError } from "../types";
import { MockEntitlementRepository } from "./mockRepository";

// ---- Mock Cache ----
class MockCacheService implements ICacheService {
  private store = new Map<string, Record<string, unknown>>();
  async get(orgId: string) {
    return this.store.get(orgId) ?? null;
  }
  async set(orgId: string, data: Record<string, unknown>) {
    this.store.set(orgId, data);
  }
  async invalidate(orgId: string) {
    this.store.delete(orgId);
  }
  async invalidateAll() {
    this.store.clear();
  }
}

// ---- Fixture: build the repo from the shared matrix ----
function createMatrixFixture() {
  const repo = new MockEntitlementRepository();
  const cache = new MockCacheService();
  const gate = new FeatureGateService(repo, cache);

  // Plans (from shared matrix)
  for (const plan of PLANS) {
    repo.addPlan(plan.key, plan.name, plan.priceMonthly);
  }

  // Features (from shared matrix)
  for (const f of FEATURES) {
    repo.addFeature(
      f.key,
      f.type.toLowerCase() as "boolean" | "limit" | "experiment",
      f.description,
    );
  }

  // Plan → feature mappings (from shared matrix)
  for (const [planKey, mappings] of Object.entries(PLAN_FEATURE_MAP)) {
    for (const m of mappings) {
      repo.addPlanFeature(planKey, m.key, m.enabled, m.limit ?? null);
    }
  }

  // One org per plan, subscribed to that plan
  for (const plan of PLANS) {
    const orgId = `org-${plan.key.toLowerCase()}`;
    repo.addOrg(orgId);
    repo.addSubscription(orgId, plan.key);
  }

  return { repo, cache, gate };
}

describe("plan matrix — matrix data integrity", () => {
  it("every feature in the matrix is mapped to every plan", () => {
    for (const plan of PLANS) {
      const mapped = new Set(PLAN_FEATURE_MAP[plan.key].map((m) => m.key));
      for (const f of FEATURES) {
        expect(mapped.has(f.key), `${plan.key} is missing mapping for ${f.key}`).toBe(true);
      }
    }
  });

  it("the top plan (BUSINESS) enables every feature", () => {
    const topKey = getTopPlanKey();
    expect(topKey).toBe("BUSINESS");
    for (const f of FEATURES) {
      const m = PLAN_FEATURE_MAP[topKey].find((x) => x.key === f.key);
      expect(m?.enabled, `${f.key} must be enabled on ${topKey}`).toBe(true);
    }
  });

  it("top plan limits for LIMIT features are null (unlimited)", () => {
    const topKey = getTopPlanKey();
    for (const f of FEATURES.filter((x) => x.type === "LIMIT")) {
      const m = PLAN_FEATURE_MAP[topKey].find((x) => x.key === f.key);
      expect(m?.limit).toBeNull();
    }
  });

  it("plan ranking is FREE < STARTER < PRO < BUSINESS", () => {
    expect(getPlanRank("FREE")).toBeLessThan(getPlanRank("STARTER"));
    expect(getPlanRank("STARTER")).toBeLessThan(getPlanRank("PRO"));
    expect(getPlanRank("PRO")).toBeLessThan(getPlanRank("BUSINESS"));
  });
});

describe("plan matrix — hasFeature per plan", () => {
  it("each plan gets exactly its mapped features (enabled or not)", async () => {
    const { gate } = createMatrixFixture();

    for (const plan of PLANS) {
      const orgId = `org-${plan.key.toLowerCase()}`;
      for (const f of FEATURES) {
        const mapping = PLAN_FEATURE_MAP[plan.key].find((m) => m.key === f.key);
        const expected = mapping?.enabled ?? false;
        const actual = await gate.hasFeature(orgId, f.key);
        expect(actual, `${plan.key} → ${f.key}: expected ${expected}, got ${actual}`).toBe(
          expected,
        );
      }
    }
  });

  it("BUSINESS can access every feature in the catalog", async () => {
    const { gate } = createMatrixFixture();
    const orgId = "org-business";

    for (const f of FEATURES) {
      expect(await gate.hasFeature(orgId, f.key), `BUSINESS → ${f.key}`).toBe(true);
    }
  });

  it("lower plans cannot access features reserved for higher plans", async () => {
    const { gate } = createMatrixFixture();

    // WHITELABEL + PRIORITY_SUPPORT are BUSINESS-only in the matrix
    const businessOnly = ["WHITELABEL", "PRIORITY_SUPPORT"];
    for (const plan of ["FREE", "STARTER", "PRO"] as const) {
      const orgId = `org-${plan.toLowerCase()}`;
      for (const f of businessOnly) {
        expect(await gate.hasFeature(orgId, f), `${plan} must NOT have ${f}`).toBe(false);
      }
    }
  });

  it("an unmapped feature is still enabled for the top plan and disabled for others", async () => {
    const { repo, gate } = createMatrixFixture();
    // Add a brand new feature with NO plan mapping (simulates a future feature)
    repo.addFeature("NEW_FEATURE_X", "boolean", "Future feature");

    for (const plan of PLANS) {
      const orgId = `org-${plan.key.toLowerCase()}`;
      const expected = plan.key === getTopPlanKey();
      expect(await gate.hasFeature(orgId, "NEW_FEATURE_X"), `${plan.key} → NEW_FEATURE_X`).toBe(
        expected,
      );
    }
  });
});

describe("plan matrix — assertFeature enforcement", () => {
  it("assertFeature throws for every feature a plan cannot access", async () => {
    const { gate } = createMatrixFixture();

    for (const plan of PLANS) {
      const orgId = `org-${plan.key.toLowerCase()}`;
      for (const f of FEATURES) {
        const mapping = PLAN_FEATURE_MAP[plan.key].find((m) => m.key === f.key);
        const enabled = mapping?.enabled ?? false;

        if (enabled) {
          await expect(
            gate.assertFeature(orgId, f.key),
            `${plan.key} should allow ${f.key}`,
          ).resolves.toBeUndefined();
        } else {
          await expect(
            gate.assertFeature(orgId, f.key),
            `${plan.key} should block ${f.key}`,
          ).rejects.toThrow(FeatureNotAvailableError);
        }
      }
    }
  });

  it("403 error tells the user which plan unlocks the feature", async () => {
    const { gate } = createMatrixFixture();
    // WHITELABEL: FREE → first plan that enables it is BUSINESS
    await expect(gate.assertFeature("org-free", "WHITELABEL")).rejects.toMatchObject({
      planRequired: "BUSINESS",
      currentPlan: "FREE",
      statusCode: 403,
      upgradeUrl: "/billing/upgrade",
    });
    // EXPORT_PDF: FREE → enabled on STARTER
    await expect(gate.assertFeature("org-free", "EXPORT_PDF")).rejects.toMatchObject({
      planRequired: "STARTER",
      currentPlan: "FREE",
    });
  });
});

describe("plan matrix — limits", () => {
  it("BULK_VALIDATE limit matches the matrix per plan", async () => {
    const { gate } = createMatrixFixture();
    const expectedLimits: Record<string, number | null> = {
      FREE: null, // not granted — bulk is a paid feature
      STARTER: 5000,
      PRO: 50000,
      BUSINESS: null, // unlimited
    };

    for (const plan of PLANS) {
      const orgId = `org-${plan.key.toLowerCase()}`;
      expect(await gate.getLimit(orgId, "BULK_VALIDATE"), `${plan.key} BULK_VALIDATE limit`).toBe(
        expectedLimits[plan.key],
      );
    }
  });

  it("TEAM_MEMBERS limit matches the matrix per plan", async () => {
    const { gate } = createMatrixFixture();
    const expectedLimits: Record<string, number | null> = {
      FREE: 1,
      STARTER: 3,
      PRO: 10,
      BUSINESS: null, // unlimited
    };

    for (const plan of PLANS) {
      const orgId = `org-${plan.key.toLowerCase()}`;
      expect(await gate.getLimit(orgId, "TEAM_MEMBERS"), `${plan.key} TEAM_MEMBERS limit`).toBe(
        expectedLimits[plan.key],
      );
    }
  });

  it("boolean features have null limit on every plan", async () => {
    const { gate } = createMatrixFixture();
    for (const plan of PLANS) {
      const orgId = `org-${plan.key.toLowerCase()}`;
      for (const f of FEATURES.filter((x) => x.type === "BOOLEAN")) {
        expect(await gate.getLimit(orgId, f.key), `${plan.key} ${f.key} limit`).toBeNull();
      }
    }
  });

  it("FREE has no BULK_VALIDATE access (bulk is a paid feature)", async () => {
    const { gate } = createMatrixFixture();
    expect(await gate.hasFeature("org-free", "BULK_VALIDATE")).toBe(false);
    await expect(gate.assertFeature("org-free", "BULK_VALIDATE")).rejects.toThrow(
      FeatureNotAvailableError,
    );
  });

  it("consume is blocked at the plan limit for lower plans, unlimited for BUSINESS", async () => {
    const { gate } = createMatrixFixture();

    // STARTER: TEAM_MEMBERS limit 3 — 4th consume fails
    for (let i = 0; i < 3; i++) {
      const ok = await gate.consume("org-starter", "TEAM_MEMBERS", 1);
      expect(ok.success).toBe(true);
    }
    const blocked = await gate.consume("org-starter", "TEAM_MEMBERS", 1);
    expect(blocked.success).toBe(false);
    if (!blocked.success) expect(blocked.error).toBe("LIMIT_REACHED");

    // BUSINESS: unlimited — consume 100k units succeeds
    const unlimited = await gate.consume("org-business", "BULK_VALIDATE", 100000);
    expect(unlimited.success).toBe(true);
  });
});

describe("plan matrix — getAllEntitlements (frontend payload)", () => {
  it("entitlements features match the matrix per plan", async () => {
    const { gate } = createMatrixFixture();

    for (const plan of PLANS) {
      const orgId = `org-${plan.key.toLowerCase()}`;
      const ent = await gate.getAllEntitlements(orgId);

      for (const f of FEATURES) {
        const mapping = PLAN_FEATURE_MAP[plan.key].find((m) => m.key === f.key);
        expect(ent.features[f.key], `${plan.key} entitlements → ${f.key}`).toBe(
          mapping?.enabled ?? false,
        );
      }
    }
  });

  it("entitlements limits match the matrix per plan", async () => {
    const { gate } = createMatrixFixture();
    const expectedLimits: Record<string, Record<string, number | null>> = {
      FREE: { BULK_VALIDATE: null, TEAM_MEMBERS: 1 },
      STARTER: { BULK_VALIDATE: 5000, TEAM_MEMBERS: 3 },
      PRO: { BULK_VALIDATE: 50000, TEAM_MEMBERS: 10 },
      BUSINESS: { BULK_VALIDATE: null, TEAM_MEMBERS: null },
    };

    for (const plan of PLANS) {
      const orgId = `org-${plan.key.toLowerCase()}`;
      const ent = await gate.getAllEntitlements(orgId);
      expect(ent.limits["BULK_VALIDATE"]).toBe(expectedLimits[plan.key].BULK_VALIDATE);
      expect(ent.limits["TEAM_MEMBERS"]).toBe(expectedLimits[plan.key].TEAM_MEMBERS);
    }
  });

  it("BUSINESS entitlements enable every feature in the catalog", async () => {
    const { gate } = createMatrixFixture();
    const ent = await gate.getAllEntitlements("org-business");

    for (const f of FEATURES) {
      expect(ent.features[f.key], `BUSINESS entitlements → ${f.key}`).toBe(true);
    }
  });
});
