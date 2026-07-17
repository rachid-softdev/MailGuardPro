// ================================================================
// StripeWebhookHandler — Polish tests (follow-up to PR #142)
// Covers:
//   FIX 1a — idempotency marker is released when event processing throws
//   FIX 1c — handleVerifiedEvent routes without re-verifying the signature
// ================================================================

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

import { StripeWebhookHandler } from "@/services/feature-flags/stripeWebhookHandler";

// ---- Module-level mocks (dynamic imports inside the handler) ----
const {
  mockUserUpdateMany,
  mockRedisSet,
  mockRedisDel,
  mockStripeEventCreate,
  mockStripeEventDelete,
  mockLogError,
  mockLogWarn,
} = vi.hoisted(() => ({
  mockUserUpdateMany: vi.fn(),
  mockRedisSet: vi.fn(),
  mockRedisDel: vi.fn(),
  mockStripeEventCreate: vi.fn(),
  mockStripeEventDelete: vi.fn(),
  mockLogError: vi.fn(),
  mockLogWarn: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      updateMany: mockUserUpdateMany,
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    stripeEvent: { create: mockStripeEventCreate, deleteMany: mockStripeEventDelete },
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: { set: mockRedisSet, del: mockRedisDel },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: mockLogError,
    info: vi.fn(),
    warn: mockLogWarn,
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
  mockRedisDel.mockResolvedValue(1);
  mockStripeEventCreate.mockResolvedValue({});
  mockStripeEventDelete.mockResolvedValue({ count: 1 });
  mockUserUpdateMany.mockResolvedValue({ count: 1 });

  repoMock.getOrganizationByStripeCustomerId.mockResolvedValue({
    id: "org_1",
    name: "Org 1",
    stripe_customer_id: "cus_1",
  });
  repoMock.upsertSubscription.mockResolvedValue({});
  repoMock.updateSubscriptionStatus.mockResolvedValue(undefined);
  repoMock.createOverride.mockResolvedValue({});

  handler = new StripeWebhookHandler(repoMock, cacheMock, fakeStripe, WEBHOOK_SECRET);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ================================================================
// FIX 1a — idempotency released on processing failure
// ================================================================
describe("FIX 1a — idempotency marker released on processing failure", () => {
  it("releases the marker (redis.del) when event processing throws", async () => {
    // Force a processing error inside the routing switch.
    repoMock.getOrganizationByStripeCustomerId.mockRejectedValue(new Error("DB down"));
    mockConstructEvent.mockReturnValue(
      makeEvent("customer.subscription.created", { customer: "cus_1", id: "sub_1" }),
    );

    const releaseSpy = vi.spyOn(handler as any, "releaseIdempotency");

    await expect(handler.handleWebhookEvent("body", "sig")).rejects.toThrow();

    // The marker must be released so Stripe's retry reprocesses the event.
    expect(releaseSpy).toHaveBeenCalledTimes(1);
    expect(mockRedisDel).toHaveBeenCalledWith("stripe:event:evt_customer.subscription.created_1");
  });

  it("release failure does NOT mask the original processing error", async () => {
    repoMock.getOrganizationByStripeCustomerId.mockRejectedValue(new Error("DB down (original)"));
    mockRedisSet.mockResolvedValue("OK");
    mockRedisDel.mockRejectedValue(new Error("redis gone"));
    mockStripeEventDelete.mockRejectedValue(new Error("pg gone"));
    mockConstructEvent.mockReturnValue(
      makeEvent("customer.subscription.created", { customer: "cus_1", id: "sub_1" }),
    );

    await expect(handler.handleWebhookEvent("body", "sig")).rejects.toThrow(/DB down/);
  });

  it("releases the PG stripeEvent row when Redis was not the active layer", async () => {
    // Redis layer fails → checkIdempotency falls back to PG (create → "new").
    mockRedisSet.mockRejectedValue(new Error("redis down"));
    mockStripeEventCreate.mockResolvedValue({ id: "evt_customer.subscription.created_1" });
    repoMock.getOrganizationByStripeCustomerId.mockRejectedValue(new Error("DB down"));
    mockConstructEvent.mockReturnValue(
      makeEvent("customer.subscription.created", { customer: "cus_1", id: "sub_1" }),
    );

    await expect(handler.handleWebhookEvent("body", "sig")).rejects.toThrow();

    expect(mockStripeEventDelete).toHaveBeenCalledWith({
      where: { id: "evt_customer.subscription.created_1" },
    });
  });
});

// ================================================================
// FIX 1c — handleVerifiedEvent does not re-verify the signature
// ================================================================
describe("FIX 1c — handleVerifiedEvent does not re-verify signature", () => {
  it("handleVerifiedEvent routes without calling stripe.webhooks.constructEvent", async () => {
    mockConstructEvent.mockClear();
    const event = makeEvent("customer.subscription.updated", {
      customer: "cus_1",
      id: "sub_1",
      status: "active",
      items: { data: [{ price: { id: "price_pro" } }] },
      current_period_start: 1_700_000_000,
      current_period_end: 1_800_000_000,
    });

    const result = await handler.handleVerifiedEvent(event);

    expect(result.received).toBe(true);
    // The caller already verified the signature; the handler must not do it again.
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });
});
