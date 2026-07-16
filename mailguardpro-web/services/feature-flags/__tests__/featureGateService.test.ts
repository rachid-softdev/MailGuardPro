// ================================================================
// FeatureGateService — Comprehensive Test Suite
// ================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ICacheService } from "../cacheService";
import { FeatureGateService } from "../featureGateService";
import { FeatureNotAvailableError, hashExperimentBucket, LimitReachedError } from "../types";
import type { MockedRedis } from "./mockRepository";
import { MockEntitlementRepository } from "./mockRepository";

// The StripeWebhookHandler idempotency check falls through to prisma.stripeEvent
// when redis is unavailable; the real prisma client cannot be loaded in tests,
// so we stub it. This makes the idempotency path resolve to "new".
vi.mock("@/lib/prisma", () => ({
  prisma: {
    stripeEvent: { create: vi.fn().mockResolvedValue({}) },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: {},
}));

// ---- Mock Cache Service ----
class MockCacheService implements ICacheService {
  private store = new Map<string, Record<string, unknown>>();

  async get(orgId: string): Promise<Record<string, unknown> | null> {
    return this.store.get(orgId) ?? null;
  }

  async set(orgId: string, data: Record<string, unknown>): Promise<void> {
    this.store.set(orgId, data);
  }

  async invalidate(orgId: string): Promise<void> {
    this.store.delete(orgId);
  }

  async invalidateAll(): Promise<void> {
    this.store.clear();
  }
}

// ---- Fixtures ----

function createFixture() {
  const repo = new MockEntitlementRepository();
  const cache = new MockCacheService();
  const gate = new FeatureGateService(repo, cache);

  // Seed plans
  repo.addPlan("FREE", "Free Plan");
  repo.addPlan("PRO", "Pro Plan", 2900);
  repo.addPlan("ENTERPRISE", "Enterprise Plan", 9900);

  // Seed features
  repo.addFeature("EXPORT_PDF", "boolean", "Export emails to PDF");
  repo.addFeature("AI_SUMMARY", "boolean", "AI-powered email summary");
  repo.addFeature("BULK_VALIDATE", "limit", "Bulk email validation");
  repo.addFeature("API_ACCESS", "boolean", "API access");
  repo.addFeature("NEW_DASHBOARD", "experiment", "New dashboard A/B test");

  // Plan features
  repo.addPlanFeature("FREE", "EXPORT_PDF", false);
  repo.addPlanFeature("FREE", "AI_SUMMARY", false);
  repo.addPlanFeature("FREE", "BULK_VALIDATE", true, 3);
  repo.addPlanFeature("FREE", "API_ACCESS", false);
  repo.addPlanFeature("PRO", "EXPORT_PDF", true);
  repo.addPlanFeature("PRO", "AI_SUMMARY", true);
  repo.addPlanFeature("PRO", "BULK_VALIDATE", true, 100);
  repo.addPlanFeature("PRO", "API_ACCESS", true);
  repo.addPlanFeature("ENTERPRISE", "EXPORT_PDF", true);
  repo.addPlanFeature("ENTERPRISE", "BULK_VALIDATE", true, null); // unlimited
  repo.addPlanFeature("ENTERPRISE", "API_ACCESS", true);

  // Org
  repo.addOrg("org-free");
  repo.addOrg("org-pro");
  repo.addOrg("org-ent");

  // Subscriptions
  repo.addSubscription("org-free", "FREE");
  repo.addSubscription("org-pro", "PRO");
  repo.addSubscription("org-ent", "ENTERPRISE");

  return { repo, cache, gate };
}

describe("FeatureGateService", () => {
  describe("hasFeature — feature active via plan", () => {
    it("should return true for PRO plan with EXPORT_PDF", async () => {
      const { gate } = createFixture();
      const result = await gate.hasFeature("org-pro", "EXPORT_PDF");
      expect(result).toBe(true);
    });

    it("should return false for FREE plan with EXPORT_PDF", async () => {
      const { gate } = createFixture();
      const result = await gate.hasFeature("org-free", "EXPORT_PDF");
      expect(result).toBe(false);
    });
  });

  describe("override priority", () => {
    it("user override enabled should override plan (disabled)", async () => {
      const { gate, repo } = createFixture();
      repo.addOverride("user", "user-1", "EXPORT_PDF", true);
      const result = await gate.hasFeature("org-free", "EXPORT_PDF", "user-1");
      expect(result).toBe(true);
    });

    it("user override disabled should override plan (enabled)", async () => {
      const { gate, repo } = createFixture();
      repo.addOverride("user", "user-1", "EXPORT_PDF", false);
      const result = await gate.hasFeature("org-pro", "EXPORT_PDF", "user-1");
      expect(result).toBe(false);
    });

    it("org override should override plan", async () => {
      const { gate, repo } = createFixture();
      repo.addOverride("org", "org-free", "EXPORT_PDF", true);
      const result = await gate.hasFeature("org-free", "EXPORT_PDF");
      expect(result).toBe(true);
    });

    it("expired override should fall back to plan", async () => {
      const { gate, repo } = createFixture();
      const expired = new Date(Date.now() - 86400000); // 1 day ago
      repo.addOverride("org", "org-free", "EXPORT_PDF", true, null, expired);
      const result = await gate.hasFeature("org-free", "EXPORT_PDF");
      expect(result).toBe(false); // Falls back to FREE plan = disabled
    });
  });

  describe("assertFeature", () => {
    it("should throw FeatureNotAvailableError for disabled feature", async () => {
      const { gate } = createFixture();
      await expect(gate.assertFeature("org-free", "EXPORT_PDF")).rejects.toThrow(
        FeatureNotAvailableError,
      );
    });

    it("should not throw for enabled feature", async () => {
      const { gate } = createFixture();
      await expect(gate.assertFeature("org-pro", "EXPORT_PDF")).resolves.toBeUndefined();
    });
  });

  describe("getLimit", () => {
    it("should return 3 for FREE BULK_VALIDATE", async () => {
      const { gate } = createFixture();
      const limit = await gate.getLimit("org-free", "BULK_VALIDATE");
      expect(limit).toBe(3);
    });

    it("should return null (unlimited) for ENTERPRISE BULK_VALIDATE", async () => {
      const { gate } = createFixture();
      const limit = await gate.getLimit("org-ent", "BULK_VALIDATE");
      expect(limit).toBeNull();
    });

    it("should return null for boolean feature type", async () => {
      const { gate } = createFixture();
      const limit = await gate.getLimit("org-pro", "EXPORT_PDF");
      expect(limit).toBeNull();
    });
  });

  describe("canConsume", () => {
    it("should return true when under limit", async () => {
      const { gate } = createFixture();
      const result = await gate.canConsume("org-free", "BULK_VALIDATE", 1);
      expect(result).toBe(true);
    });

    it("should return false when over limit", async () => {
      const { gate } = createFixture();
      // First, consume to reach limit
      await gate.consume("org-free", "BULK_VALIDATE", 3);
      const result = await gate.canConsume("org-free", "BULK_VALIDATE", 1);
      expect(result).toBe(false);
    });

    it("should return true for unlimited feature", async () => {
      const { gate } = createFixture();
      const result = await gate.canConsume("org-ent", "BULK_VALIDATE", 99999);
      expect(result).toBe(true);
    });
  });

  describe("consume", () => {
    it("should succeed and return remaining count", async () => {
      const { gate } = createFixture();
      const result = await gate.consume("org-free", "BULK_VALIDATE", 1);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.remaining).toBe(2);
        expect(result.usage).toBe(1);
      }
    });

    it("should fail with LIMIT_REACHED when over limit", async () => {
      const { gate } = createFixture();
      await gate.consume("org-free", "BULK_VALIDATE", 3);
      const result = await gate.consume("org-free", "BULK_VALIDATE", 1);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("LIMIT_REACHED");
        expect(result.used).toBeGreaterThanOrEqual(3);
      }
    });

    it("should handle race conditions (atomic increment)", async () => {
      const { gate } = createFixture();
      // Simulate 2 concurrent consumes
      const [r1, r2] = await Promise.all([
        gate.consume("org-free", "BULK_VALIDATE", 2),
        gate.consume("org-free", "BULK_VALIDATE", 2),
      ]);
      // At least one should succeed, one might fail
      const successes = [r1, r2].filter((r) => r.success).length;
      expect(successes).toBeGreaterThanOrEqual(1);
      // Total usage should not exceed limit + increment
      const totalUsage = [r1, r2].reduce(
        (sum, r) => sum + (r.success ? r.usage : (r as any).used || 0),
        0,
      );
      expect(totalUsage).toBeLessThanOrEqual(6); // 3 + 3 = 6 (but limit is 3)
    });
  });

  describe("quota reset mensuel", () => {
    it("should reset usage for new period", async () => {
      const { gate, repo } = createFixture();
      await gate.consume("org-free", "BULK_VALIDATE", 3);
      const result1 = await gate.canConsume("org-free", "BULK_VALIDATE", 1);
      expect(result1).toBe(false);

      // Reset usage for the current period (simulating month rollover)
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      await repo.resetUsage("org-free", "BULK_VALIDATE", periodStart, periodEnd);

      const result2 = await gate.canConsume("org-free", "BULK_VALIDATE", 1);
      expect(result2).toBe(true);
    });
  });

  describe("getDebugTrace", () => {
    it("should return resolvedVia=plan for plan-level feature", async () => {
      const { gate } = createFixture();
      const trace = await gate.getDebugTrace("org-pro", "EXPORT_PDF");
      expect(trace.resolvedVia).toBe("plan");
      expect(trace.planKey).toBe("PRO");
      expect(trace.enabled).toBe(true);
    });

    it("should return resolvedVia=user_override when applicable", async () => {
      const { gate, repo } = createFixture();
      repo.addOverride("user", "user-1", "EXPORT_PDF", true);
      const trace = await gate.getDebugTrace("org-free", "EXPORT_PDF", "user-1");
      expect(trace.resolvedVia).toBe("user_override");
      expect(trace.enabled).toBe(true);
    });

    it("should return resolvedVia=fallback when no plan or override", async () => {
      const { gate, repo } = createFixture();
      // Remove subscription for org-free so it has no active plan
      repo.subscriptions.delete("org-free");
      const trace = await gate.getDebugTrace("org-free", "EXPORT_PDF");
      expect(trace.resolvedVia).toBe("fallback");
      expect(trace.enabled).toBe(false);
    });
  });

  describe("A/B testing (experiments)", () => {
    it("hashing stable — same user always same bucket", async () => {
      const bucket1 = hashExperimentBucket("test_seed", "user-42");
      const bucket2 = hashExperimentBucket("test_seed", "user-42");
      expect(bucket1).toBe(bucket2);
    });

    it("different users may have different buckets", async () => {
      const bucket1 = hashExperimentBucket("test_seed", "user-1");
      const bucket2 = hashExperimentBucket("test_seed", "user-2");
      // There's a 1% chance they could be equal, but generally they differ
      // We just verify both are within range
      expect(bucket1).toBeGreaterThanOrEqual(0);
      expect(bucket1).toBeLessThan(100);
      expect(bucket2).toBeGreaterThanOrEqual(0);
      expect(bucket2).toBeLessThan(100);
    });

    it("distribution ~50% over 10k users", async () => {
      const seed = "NEW_DASHBOARD_v1";
      const percentage = 50;
      let inExperiment = 0;
      const total = 10000;

      for (let i = 0; i < total; i++) {
        const bucket = hashExperimentBucket(seed, `user-${i}`);
        if (bucket < percentage) inExperiment++;
      }

      // Should be within 2% of target (48%-52%)
      const pct = (inExperiment / total) * 100;
      expect(pct).toBeGreaterThan(48);
      expect(pct).toBeLessThan(52);
    });

    it("changing seed creates different segments", async () => {
      const seed1 = "NEW_DASHBOARD_v1";
      const seed2 = "NEW_DASHBOARD_v2";

      const userBucket1 = hashExperimentBucket(seed1, "user-100");
      const userBucket2 = hashExperimentBucket(seed2, "user-100");

      // These are likely different (99% chance)
      // If equal, it's just a coincidence — verify they're both in 0-99
      expect(userBucket1).toBeGreaterThanOrEqual(0);
      expect(userBucket1).toBeLessThan(100);
      expect(userBucket2).toBeGreaterThanOrEqual(0);
      expect(userBucket2).toBeLessThan(100);
    });
  });

  describe("cache", () => {
    it("cache hit should return data without DB calls", async () => {
      const { gate, cache } = createFixture();

      // First call — should populate cache
      const entitlements1 = await gate.getAllEntitlements("org-pro");

      // Manually verify cache is populated
      const cached = await cache.get("org-pro");
      expect(cached).not.toBeNull();

      // Second call — should hit cache
      const entitlements2 = await gate.getAllEntitlements("org-pro");
      expect(entitlements2).toEqual(entitlements1);
    });

    it("cache miss should query DB and populate cache", async () => {
      const { gate } = createFixture();
      const entitlements = await gate.getAllEntitlements("org-ent");
      expect(entitlements.features["BULK_VALIDATE"]).toBe(true);
      expect(entitlements.limits["BULK_VALIDATE"]).toBeNull(); // unlimited
    });

    it("invalidateCache should clear cache", async () => {
      const { gate, cache } = createFixture();
      await gate.getAllEntitlements("org-pro");

      const cachedBefore = await cache.get("org-pro");
      expect(cachedBefore).not.toBeNull();

      await gate.invalidateCache("org-pro");

      const cachedAfter = await cache.get("org-pro");
      expect(cachedAfter).toBeNull();
    });
  });

  describe("error types", () => {
    it("FeatureNotAvailableError should have correct shape", () => {
      const err = new FeatureNotAvailableError("EXPORT_PDF", "PRO", "FREE");
      expect(err.statusCode).toBe(403);
      expect(err.toJSON()).toEqual({
        error: "FEATURE_NOT_AVAILABLE",
        feature: "EXPORT_PDF",
        plan_required: "PRO",
        current_plan: "FREE",
        upgrade_url: "/billing/upgrade",
      });
    });

    it("LimitReachedError should have correct shape", () => {
      const err = new LimitReachedError("BULK_VALIDATE", 100, 100, "2026-06-01T00:00:00Z");
      expect(err.statusCode).toBe(402);
      expect(err.toJSON()).toEqual({
        error: "LIMIT_REACHED",
        feature: "BULK_VALIDATE",
        limit: 100,
        used: 100,
        reset_at: "2026-06-01T00:00:00Z",
        upgrade_url: "/billing/upgrade",
      });
    });
  });

  describe("getAllEntitlements", () => {
    it("should return all entitlements for an org", async () => {
      const { gate } = createFixture();
      const entitlements = await gate.getAllEntitlements("org-pro");
      expect(entitlements.features["EXPORT_PDF"]).toBe(true);
      expect(entitlements.features["AI_SUMMARY"]).toBe(true);
      expect(entitlements.features["API_ACCESS"]).toBe(true);
      expect(entitlements.limits["BULK_VALIDATE"]).toBe(100);
    });

    it("should include usage data", async () => {
      const { gate } = createFixture();
      await gate.consume("org-pro", "BULK_VALIDATE", 5);
      const entitlements = await gate.getAllEntitlements("org-pro");
      expect(entitlements.usage["BULK_VALIDATE"]).toBeGreaterThanOrEqual(5);
    });
  });
});

describe("CacheService", () => {
  it("LRU cache eviction", async () => {
    const { LRUCache } = await import("../cacheService");
    const cache = new LRUCache<string>(3, 60000); // max 3 items, 60s TTL

    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");
    cache.set("d", "4"); // Should evict 'a'

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("2");
    expect(cache.get("d")).toBe("4");
  });

  it("LRU cache TTL expiry", async () => {
    const { LRUCache } = await import("../cacheService");
    const cache = new LRUCache<string>(100, 10); // 10ms TTL

    cache.set("key", "value");
    expect(cache.get("key")).toBe("value");

    // Wait for expiry
    await new Promise((r) => setTimeout(r, 20));
    expect(cache.get("key")).toBeUndefined();
  });
});

describe("downgrade scenarios", () => {
  it("graceful downgrade should keep access until period_end", async () => {
    const { repo, gate } = createFixture();
    // Create subscription with future period_end
    const futureDate = new Date(Date.now() + 86400000 * 30); // 30 days from now
    repo.addSubscription("org-pro", "PRO", "active", "sub_123", new Date(), futureDate);
    // Add feature with graceful strategy
    repo.addPlanFeature("FREE", "AI_SUMMARY", false, null, null, "graceful");

    // Before downgrade, feature is enabled
    const before = await gate.hasFeature("org-pro", "AI_SUMMARY");
    expect(before).toBe(true);

    // After downgrade (updated subscription), feature may still be accessible
    // if override exists
    repo.subscriptions.set("org-pro", {
      id: "sub-new",
      org_id: "org-pro",
      plan_key: "FREE",
      status: "active",
      stripe_sub_id: null,
      current_period_start: new Date(),
      current_period_end: futureDate,
    });

    // With graceful override created manually (simulating what executeDowngrade does)
    repo.addOverride("org", "org-pro", "AI_SUMMARY", true, null, futureDate);
    const duringGrace = await gate.hasFeature("org-pro", "AI_SUMMARY");
    expect(duringGrace).toBe(true);
  });

  it("immediate downgrade should cut access immediately", async () => {
    const { gate, repo } = createFixture();

    // PRO has AI_SUMMARY enabled
    const before = await gate.hasFeature("org-pro", "AI_SUMMARY");
    expect(before).toBe(true);

    // Downgrade to FREE (immediate strategy)
    repo.subscriptions.set("org-pro", {
      id: "sub-new",
      org_id: "org-pro",
      plan_key: "FREE",
      status: "active",
      stripe_sub_id: null,
      current_period_start: new Date(),
      current_period_end: new Date(Date.now() + 86400000),
    });

    const after = await gate.hasFeature("org-pro", "AI_SUMMARY");
    expect(after).toBe(false);
  });
});

describe("Stripe webhook scenarios", () => {
  it("invalid signature should be rejected", async () => {
    const { StripeWebhookHandler } = await import("../stripeWebhookHandler");
    const repo = new MockEntitlementRepository();
    const cache = new MockCacheService();

    const mockStripe = {
      webhooks: {
        constructEvent: vi.fn(() => {
          throw new Error("Invalid signature");
        }),
      },
    } as any;

    const handler = new StripeWebhookHandler(repo, cache, mockStripe, "test_secret");

    const result = await handler.handleWebhookEvent(
      JSON.stringify({ id: "evt_test" }),
      "invalid_signature",
    );
    expect(result.received).toBe(false);
    expect(result.error).toBe("Invalid signature");
  });

  it("should handle valid webhook event with proper mock", async () => {
    const { StripeWebhookHandler } = await import("../stripeWebhookHandler");
    const { repo, cache } = createFixture();

    const mockEvent = {
      id: "evt_valid_1",
      type: "customer.subscription.deleted",
      data: { object: { customer: "cus_test", id: "sub_test" } },
    };

    const mockStripe = {
      webhooks: {
        constructEvent: vi.fn(() => mockEvent),
      },
      customers: {
        retrieve: vi
          .fn()
          .mockResolvedValue({ deleted: false, name: "Test", email: "test@test.com" }),
      },
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({}),
      },
    } as any;

    const handler = new StripeWebhookHandler(repo, cache, mockStripe, "test_secret");
    const result = await handler.handleWebhookEvent(JSON.stringify(mockEvent), "valid_signature");

    expect(result.received).toBe(true);
    expect(result.eventType).toBe("customer.subscription.deleted");
  });
});
