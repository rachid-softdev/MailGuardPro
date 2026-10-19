// ================================================================
// StripeWebhookHandler — Retry semantics (post-audit wave 3)
// ================================================================
// Contract under test:
//   A transient processing failure (Stripe API / DB) must NOT leave the
//   event marked as consumed. The handler releases the idempotency marker
//   (Redis + PG fallback) and rethrows so the route answers 5xx and
//   Stripe retries the delivery.
// ================================================================

import type Stripe from "stripe";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { StripeWebhookHandler } from "@/services/feature-flags/stripeWebhookHandler";

// ---- Module-level mocks (dynamic imports inside the handler) ----
const { mockUserUpdateMany, mockRedisSet, mockRedisDel, mockStripeEventDeleteMany, mockLogError } =
  vi.hoisted(() => ({
    mockUserUpdateMany: vi.fn(),
    mockRedisSet: vi.fn(),
    mockRedisDel: vi.fn(),
    mockStripeEventDeleteMany: vi.fn(),
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
    stripeEvent: { create: vi.fn(), deleteMany: mockStripeEventDeleteMany },
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: { set: mockRedisSet, del: mockRedisDel },
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
const mockSubRetrieve = vi.fn();

const fakeStripe = {
  webhooks: { constructEvent: vi.fn() },
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

function makeEvent(type: string, object: Record<string, unknown>): Stripe.Event {
  return { id: `evt_${type}_retry`, type, data: { object } } as unknown as Stripe.Event;
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
  mockRedisSet.mockResolvedValue("OK");
  mockRedisDel.mockResolvedValue(1);
  mockStripeEventDeleteMany.mockResolvedValue({ count: 0 });
  mockUserUpdateMany.mockResolvedValue({ count: 1 });
  mockSubRetrieve.mockResolvedValue({
    items: { data: [{ price: { id: "price_pro" } }] },
    current_period_start: 1_700_000_000,
    current_period_end: 1_800_000_000,
  });

  repoMock.getOrganizationByStripeCustomerId.mockResolvedValue({
    id: "org_1",
    name: "Org 1",
    stripe_customer_id: "cus_1",
  });
  repoMock.upsertSubscription.mockResolvedValue({});
  repoMock.updateSubscriptionStatus.mockResolvedValue(undefined);

  handler = new StripeWebhookHandler(repoMock, cacheMock, fakeStripe, WEBHOOK_SECRET);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ================================================================
// invoice.payment_succeeded — renewal failures must be retried
// ================================================================
describe("invoice.payment_succeeded — transient failure is retryable", () => {
  it("Stripe retrieve failure → rejects + releases Redis and PG markers", async () => {
    mockSubRetrieve.mockRejectedValue(new Error("Stripe API down"));
    const event = makeEvent("invoice.payment_succeeded", {
      customer: "cus_1",
      subscription: "sub_1",
    });

    await expect(handler.handleVerifiedEvent(event)).rejects.toThrow("Stripe API down");

    expect(mockRedisDel).toHaveBeenCalledWith(`stripe:event:${event.id}`);
    expect(mockStripeEventDeleteMany).toHaveBeenCalledWith({ where: { id: event.id } });
    expect(repoMock.upsertSubscription).not.toHaveBeenCalled();
  });

  it("DB failure while renewing the period → rejects + releases markers", async () => {
    repoMock.upsertSubscription.mockRejectedValue(new Error("DB down"));
    const event = makeEvent("invoice.payment_succeeded", {
      customer: "cus_1",
      subscription: "sub_1",
    });

    await expect(handler.handleVerifiedEvent(event)).rejects.toThrow("DB down");

    expect(mockRedisDel).toHaveBeenCalledWith(`stripe:event:${event.id}`);
    expect(mockStripeEventDeleteMany).toHaveBeenCalledWith({ where: { id: event.id } });
  });

  it("success → keeps the marker (dedupe preserved)", async () => {
    const event = makeEvent("invoice.payment_succeeded", {
      customer: "cus_1",
      subscription: "sub_1",
    });

    const result = await handler.handleVerifiedEvent(event);

    expect(result.received).toBe(true);
    expect(repoMock.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ org_id: "org_1", plan_key: "PRO", status: "active" }),
    );
    expect(mockRedisDel).not.toHaveBeenCalled();
    expect(mockStripeEventDeleteMany).not.toHaveBeenCalled();
  });
});

// ================================================================
// Subscription events — retry contract is shared by every handler
// ================================================================
describe("customer.subscription.updated — transient failure is retryable", () => {
  it("repo failure → rejects + releases markers (no silent acknowledgement)", async () => {
    repoMock.upsertSubscription.mockRejectedValue(new Error("DB down"));
    const event = makeEvent("customer.subscription.updated", {
      customer: "cus_1",
      id: "sub_1",
      status: "active",
      items: { data: [{ price: { id: "price_pro" } }] },
      current_period_start: 1_700_000_000,
      current_period_end: 1_800_000_000,
    });

    await expect(handler.handleVerifiedEvent(event)).rejects.toThrow("DB down");

    expect(mockRedisDel).toHaveBeenCalledWith(`stripe:event:${event.id}`);
    expect(mockStripeEventDeleteMany).toHaveBeenCalledWith({ where: { id: event.id } });
  });
});
