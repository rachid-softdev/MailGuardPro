// ================================================================
// StripeWebhookHandler — Regression tests for PR #141
// Covers:
//   #2 invoice.payment_failed → downgrade legacy User.plan to FREE
//   #3 subscription.updated (price change) / .deleted → sync User.plan
// ================================================================

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

import { DowngradeService } from "@/services/feature-flags/downgradeService";
import { StripeWebhookHandler } from "@/services/feature-flags/stripeWebhookHandler";

// ---- Module-level mocks (dynamic imports inside the handler) ----
// Functions referenced inside vi.mock factories must be hoisted.
const { mockUserUpdateMany, mockRedisSet, mockLogError } = vi.hoisted(() => ({
  mockUserUpdateMany: vi.fn(),
  mockRedisSet: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      updateMany: mockUserUpdateMany,
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    stripeEvent: { create: vi.fn() },
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: { set: mockRedisSet },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: mockLogError,
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---- Stripe + repo + cache fakes ----
const mockConstructEvent = vi.fn();
const mockSubRetrieve = vi.fn();

const fakeStripe = {
  webhooks: { constructEvent: mockConstructEvent },
  subscriptions: { retrieve: mockSubRetrieve },
} as unknown as Stripe;

const repoMock: any = {
  getOrganizationByStripeCustomerId: vi.fn(),
  updateSubscriptionStatus: vi.fn(),
  upsertSubscription: vi.fn(),
  getActiveSubscription: vi.fn(),
  getPlanFeatures: vi.fn(),
  createOverride: vi.fn(),
  cacheInvalidate: vi.fn(),
};

const cacheMock: any = {
  invalidate: vi.fn().mockResolvedValue(undefined),
};

const WEBHOOK_SECRET = "whsec_test";

function makeEvent(type: string, object: Record<string, unknown>) {
  return { id: `evt_${type}_1`, type, data: { object } } as unknown as Stripe.Event;
}

let handler: StripeWebhookHandler;
let executeDowngradeSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.STRIPE_PRO_PRICE_ID = "price_pro";
  process.env.STRIPE_STARTER_PRICE_ID = "price_starter";
  process.env.STRIPE_BUSINESS_PRICE_ID = "price_business";
});

beforeEach(() => {
  vi.clearAllMocks();
  // Idempotency: Redis NX acquired → "new" (not duplicate, not error)
  mockRedisSet.mockResolvedValue("OK");
  mockUserUpdateMany.mockResolvedValue({ count: 1 });

  repoMock.getOrganizationByStripeCustomerId.mockResolvedValue({
    id: "org_1",
    name: "Org 1",
    stripe_customer_id: "cus_1",
  });
  repoMock.getActiveSubscription.mockResolvedValue({
    org_id: "org_1",
    plan_key: "PRO",
    status: "active",
    stripe_sub_id: "sub_1",
  });
  repoMock.getPlanFeatures.mockResolvedValue([]); // no overrides created
  repoMock.upsertSubscription.mockResolvedValue({});
  repoMock.updateSubscriptionStatus.mockResolvedValue(undefined);
  repoMock.createOverride.mockResolvedValue({});

  // Spy to confirm DowngradeService is actually invoked (regression #2)
  executeDowngradeSpy = vi
    .spyOn(DowngradeService.prototype, "executeDowngrade")
    .mockResolvedValue(undefined);

  handler = new StripeWebhookHandler(repoMock, cacheMock, fakeStripe, WEBHOOK_SECRET);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ================================================================
// Regression #2: invoice.payment_failed downgrades legacy User.plan
// ================================================================
describe("Regression #2 — invoice.payment_failed downgrades User.plan to FREE", () => {
  it("calls executeDowngrade + updateSubscriptionStatus('past_due') + syncUserPlan('FREE')", async () => {
    mockConstructEvent.mockReturnValue(
      makeEvent("invoice.payment_failed", {
        customer: "cus_1",
        subscription: "sub_1",
        attempt_count: 3,
      }),
    );
    mockSubRetrieve.mockResolvedValue({ current_period_end: 1_700_000_000 });

    const result = await handler.handleWebhookEvent("body", "sig");

    expect(result.received).toBe(true);

    // a) DowngradeService.executeDowngrade invoked with FREE target
    expect(executeDowngradeSpy).toHaveBeenCalledWith(
      "org_1",
      "FREE",
      expect.any(Date),
    );

    // b) subscription marked past_due
    expect(repoMock.updateSubscriptionStatus).toHaveBeenCalledWith("sub_1", "past_due");

    // c) legacy User.plan synced to FREE for the org's users
    expect(mockUserUpdateMany).toHaveBeenCalledWith({
      where: { organizationId: "org_1" },
      data: { plan: "FREE" },
    });
  });

  it("does NOT sync User.plan when org cannot be resolved", async () => {
    repoMock.getOrganizationByStripeCustomerId.mockResolvedValue(null);
    mockConstructEvent.mockReturnValue(
      makeEvent("invoice.payment_failed", {
        customer: "cus_unknown",
        subscription: "sub_x",
        attempt_count: 3,
      }),
    );

    await handler.handleWebhookEvent("body", "sig");

    expect(mockUserUpdateMany).not.toHaveBeenCalled();
    expect(executeDowngradeSpy).not.toHaveBeenCalled();
  });
});

// ================================================================
// Regression #3: subscription.updated / .deleted sync User.plan
// ================================================================
describe("Regression #3 — subscription sync legacy User.plan", () => {
  it("customer.subscription.updated (price change) → syncUserPlan(new plan key)", async () => {
    mockConstructEvent.mockReturnValue(
      makeEvent("customer.subscription.updated", {
        customer: "cus_1",
        id: "sub_1",
        status: "active",
        items: { data: [{ price: { id: "price_pro" } }] },
        current_period_start: 1_700_000_000,
        current_period_end: 1_800_000_000,
      }),
    );

    await handler.handleWebhookEvent("body", "sig");

    // New plan key resolved from price → PRO, upserted and synced to users
    expect(repoMock.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ org_id: "org_1", plan_key: "PRO" }),
    );
    expect(mockUserUpdateMany).toHaveBeenCalledWith({
      where: { organizationId: "org_1" },
      data: { plan: "PRO" },
    });
  });

  it("customer.subscription.deleted → syncUserPlan('FREE')", async () => {
    mockConstructEvent.mockReturnValue(
      makeEvent("customer.subscription.deleted", {
        customer: "cus_1",
        id: "sub_1",
      }),
    );

    await handler.handleWebhookEvent("body", "sig");

    expect(repoMock.updateSubscriptionStatus).toHaveBeenCalledWith("sub_1", "canceled");
    expect(mockUserUpdateMany).toHaveBeenCalledWith({
      where: { organizationId: "org_1" },
      data: { plan: "FREE" },
    });
  });
});
