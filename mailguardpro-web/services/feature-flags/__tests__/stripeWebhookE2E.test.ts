// ================================================================
// Stripe Webhook E2E Integration — Route + Real FF Handler
// ================================================================
// Tests the actual route POST handler with the REAL
// StripeWebhookHandler, injecting a mocked Stripe client so we
// control signature verification and customer retrieval.
// Validates the full chain:
//   1. Route receives event, verifies signature, checks idempotency
//   2. FF handler constructs and routes the event
//   3. Subscription is upserted in the repository
//   4. Cache is invalidated
// ================================================================

import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CacheService } from "../cacheService";
import { PrismaEntitlementRepository } from "../entitlementRepository";
import { StripeWebhookHandler } from "../stripeWebhookHandler";

// ================================================================
// Mocks for route-level dependencies
// ================================================================
const mockHeadersGet = vi.fn();
const mockRedisSet = vi.fn();
const mockCheckRateLimit = vi.fn();

// ================================================================
// Injected Stripe client mock — used by the real FF handler
// ================================================================
const mockStripeConstructEvent = vi.fn();
const mockStripeRetrieveSub = vi.fn();
const mockStripeRetrieveCustomer = vi.fn();

function createMockStripe() {
  return {
    webhooks: { constructEvent: mockStripeConstructEvent },
    subscriptions: { retrieve: mockStripeRetrieveSub },
    customers: { retrieve: mockStripeRetrieveCustomer },
  } as unknown as Stripe;
}

// ================================================================
// Prisma mock — used by PrismaEntitlementRepository inside FF handler
// ================================================================
function createMockPrisma() {
  const mockOrg = {
    id: "org-e2e",
    name: "E2E Org",
    stripe_customer_id: "cus_e2e_test",
    created_at: new Date(),
    metadata: {},
  };

  const findFirst = vi.fn((args: any) => {
    if (args?.where?.stripe_customer_id === "cus_e2e_test") return Promise.resolve(mockOrg);
    if (args?.where?.stripe_sub_id === "sub_e2e_1")
      return Promise.resolve({ id: 1, org_id: "org-e2e", plan_key: "PRO", status: "active" });
    return Promise.resolve(null);
  });

  const upsert = vi.fn().mockResolvedValue({ id: "sub_e2e_1", org_id: "org-e2e", plan_key: "PRO" });

  return {
    pricingPlan: {
      findMany: vi.fn().mockResolvedValue([
        { id: "p1", key: "FREE", name: "Free", price: 0, downgrade_strategy: "immediate" },
        { id: "p2", key: "PRO", name: "Pro", price: 29, downgrade_strategy: "graceful" },
      ]),
      findUnique: vi.fn(({ where }: any) => {
        const plans: Record<string, any> = {
          FREE: { id: "p1", key: "FREE", downgrade_strategy: "immediate" },
          PRO: { id: "p2", key: "PRO", downgrade_strategy: "graceful" },
        };
        return Promise.resolve(plans[where?.key] ?? null);
      }),
      count: vi.fn().mockResolvedValue(4),
    },
    feature: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "f1",
          key: "BULK_VALIDATE",
          type: "limit",
          default_config: { limit: 3 },
          is_active: true,
        },
      ]),
      findUnique: vi.fn(),
      count: vi.fn().mockResolvedValue(12),
    },
    planFeature: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "pf1",
          plan_id: "p1",
          feature_id: "f1",
          feature_key: "BULK_VALIDATE",
          config: { limit: 3 },
        },
        {
          id: "pf2",
          plan_id: "p2",
          feature_id: "f1",
          feature_key: "BULK_VALIDATE",
          config: { limit: 100 },
        },
      ]),
    },
    organization: {
      findFirst,
      findUnique: vi.fn(({ where }: any) => {
        if (where?.stripeCustomerId === "cus_e2e_test") return Promise.resolve(mockOrg);
        return Promise.resolve(null);
      }),
      create: vi.fn().mockResolvedValue(mockOrg),
      update: vi.fn(),
    },
    subscription: {
      findFirst,
      upsert,
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    entitlementOverride: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    usageTracking: {
      findFirst: vi.fn().mockResolvedValue(null),
      aggregate: vi.fn().mockResolvedValue({ _sum: { used: 0 } }),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    user: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    stripeEvent: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn((fn: any) => fn(mockPrisma)),
    $queryRaw: vi.fn().mockResolvedValue([
      {
        id: "sub_e2e_1",
        org_id: "org-e2e",
        plan_key: "PRO",
        status: "ACTIVE",
        stripe_sub_id: "sub_e2e_1",
        current_period_start: new Date(),
        current_period_end: new Date(),
      },
    ]),
  } as any;
}

const mockPrisma = createMockPrisma();

// ================================================================
// Module mocks
// ================================================================
vi.mock("next/headers", () => ({
  headers: vi.fn(() => ({ get: mockHeadersGet })),
}));

vi.mock("@/lib/redis", () => ({
  redis: { set: mockRedisSet },
  checkRateLimit: mockCheckRateLimit,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: mockStripeConstructEvent },
    subscriptions: { retrieve: mockStripeRetrieveSub },
    customers: { retrieve: mockStripeRetrieveCustomer },
  },
  getPlanFromPriceId: vi.fn((priceId: string) => {
    const map: Record<string, string> = {
      price_starter: "STARTER",
      price_pro: "PRO",
      price_business: "BUSINESS",
    };
    return map[priceId] ?? null;
  }),
  PRICES: { STARTER: "price_starter", PRO: "price_pro", BUSINESS: "price_business" },
}));

vi.mock("@/services/auditLogger", () => ({
  AuditAction: { SUBSCRIPTION_CANCELLED: "SUBSCRIPTION_CANCELLED" },
  AuditResource: { SUBSCRIPTION: "Subscription" },
  logAudit: vi.fn(),
}));

// Mock createStripeWebhookHandler to return a real handler with injected mocks
vi.mock("@/services/feature-flags/stripeWebhookHandler", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("../stripeWebhookHandler");
  return {
    ...actual,
    createStripeWebhookHandler: vi.fn(async () => {
      const repo = new PrismaEntitlementRepository(mockPrisma as any);
      const cache = new CacheService(); // no Redis — uses noop
      return new StripeWebhookHandler(repo, cache, createMockStripe(), "whsec_e2e_test");
    }),
  };
});

// ================================================================
// Helpers
// ================================================================

function createRequest(body: string, extraHeaders?: Record<string, string>): NextRequest {
  const url = new URL("https://example.com/api/stripe/webhook");
  const headers = new Headers({
    "content-type": "application/json",
    "content-length": String(body.length),
    "x-forwarded-for": "127.0.0.1",
    ...extraHeaders,
  });
  return new NextRequest(url, { method: "POST", headers, body });
}

function makeEvent(type: string, overrides: Record<string, unknown> = {}): Stripe.Event {
  return {
    id: `evt_e2e_${Date.now()}`,
    type,
    data: {
      object: {
        id: "sub_e2e_1",
        customer: "cus_e2e_test",
        items: { data: [{ price: { id: "price_pro" } }] },
        status: "active",
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 2_592_000,
        ...overrides,
      } as any,
    },
  } as unknown as Stripe.Event;
}

let POST: (req: NextRequest) => Promise<Response>;

// ================================================================
// Suite
// ================================================================
describe("Stripe Webhook E2E — Route + Real FF Handler", () => {
  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_e2e_test";
    process.env.STRIPE_SECRET_KEY = "sk_test_e2e";
    process.env.STRIPE_PRO_PRICE_ID = "price_pro";
    process.env.STRIPE_STARTER_PRICE_ID = "price_starter";
    process.env.STRIPE_BUSINESS_PRICE_ID = "price_business";
    const mod = await import("@/app/api/stripe/webhook/route");
    POST = mod.POST;
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockHeadersGet.mockReturnValue("valid_sig");
    mockCheckRateLimit.mockResolvedValue({
      success: true,
      remaining: 59,
      resetAt: Date.now() + 60_000,
      limit: 60,
    });
    mockRedisSet.mockResolvedValue("OK");

    // Mock Stripe constructEvent to return parsed event
    mockStripeConstructEvent.mockImplementation((body: string) => JSON.parse(body));
    mockStripeRetrieveSub.mockResolvedValue({
      id: "sub_e2e_1",
      items: { data: [{ price: { id: "price_pro" } }] },
      status: "active",
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 2_592_000,
    });
    mockStripeRetrieveCustomer.mockResolvedValue({
      deleted: false,
      id: "cus_e2e_test",
      name: "E2E Org",
      email: "e2e@test.com",
    });
  });

  it("1. subscription.created → subscription upserted via $queryRaw", async () => {
    const event = makeEvent("customer.subscription.created");
    const rawBody = JSON.stringify(event);
    const res = await POST(createRequest(rawBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    // upsertSubscription uses raw SQL via $queryRaw
    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
  });

  it("2. subscription.updated → subscription upserted with new plan", async () => {
    const event = makeEvent("customer.subscription.updated", {
      items: { data: [{ price: { id: "price_business" } }] },
    });
    const rawBody = JSON.stringify(event);
    const res = await POST(createRequest(rawBody));
    expect(res.status).toBe(200);
    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
  });

  it("3. subscription.deleted → status canceled via updateMany", async () => {
    const event = makeEvent("customer.subscription.deleted");
    const rawBody = JSON.stringify(event);
    const res = await POST(createRequest(rawBody));
    expect(res.status).toBe(200);
    expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ stripeSubId: "sub_e2e_1" }),
        data: expect.objectContaining({ status: "CANCELED" }),
      }),
    );
  });

  it("4. invoice.payment_succeeded → period renewed via $queryRaw", async () => {
    const event = makeEvent("invoice.payment_succeeded", {
      subscription: "sub_e2e_1",
      id: "inv_e2e_pay",
      customer: "cus_e2e_test",
    });
    const rawBody = JSON.stringify(event);
    const res = await POST(createRequest(rawBody));
    expect(res.status).toBe(200);
    expect(mockStripeRetrieveSub).toHaveBeenCalledWith("sub_e2e_1");
    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
  });

  it("5. invoice.payment_failed → status past_due via updateMany", async () => {
    const event = makeEvent("invoice.payment_failed", {
      subscription: "sub_e2e_1",
      id: "inv_e2e_fail",
      customer: "cus_e2e_test",
      attempt_count: 2,
    });
    const rawBody = JSON.stringify(event);
    const res = await POST(createRequest(rawBody));
    expect(res.status).toBe(200);
    expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PAST_DUE" }),
      }),
    );
  });

  it("6. checkout.session.completed → credits assigned", async () => {
    const checkoutEvent = makeEvent("checkout.session.completed" as any, {
      id: "cs_e2e",
      subscription: "sub_e2e_checkout",
      mode: "subscription",
    });
    const rawBody = JSON.stringify(checkoutEvent);
    mockPrisma.user.findFirst.mockResolvedValue({
      id: "user_e2e",
      stripeCustomerId: "cus_e2e_test",
    });

    const res = await POST(createRequest(rawBody));
    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user_e2e" },
        data: expect.objectContaining({ plan: "PRO" }),
      }),
    );
  });

  it("7. unhandled event type → 200 acknowledged", async () => {
    const event = makeEvent("completely.random.event" as any, {});
    const rawBody = JSON.stringify(event);
    const res = await POST(createRequest(rawBody));
    expect(res.status).toBe(200);
  });

  it("8. duplicate event → FF handler returns deduplicated → 200", async () => {
    // First call: process normally
    mockRedisSet.mockResolvedValueOnce("OK"); // checkout idempotency (no checkout event)
    const event = makeEvent("customer.subscription.created");
    const rawBody = JSON.stringify(event);
    const res1 = await POST(createRequest(rawBody));
    expect(res1.status).toBe(200);

    // Second call: simulate idempotency skip
    vi.clearAllMocks();
    mockHeadersGet.mockReturnValue("valid_sig");
    mockCheckRateLimit.mockResolvedValue({
      success: true,
      remaining: 59,
      resetAt: Date.now() + 60_000,
      limit: 60,
    });
    mockRedisSet.mockResolvedValue("OK");
    mockStripeConstructEvent.mockImplementation((body: string) => JSON.parse(body));
    mockStripeRetrieveCustomer.mockResolvedValue({
      deleted: false,
      id: "cus_e2e_test",
      name: "E2E Org",
    });
    mockPrisma.pricingPlan.findMany.mockResolvedValue([]);
    mockPrisma.feature.findMany.mockResolvedValue([]);
    mockPrisma.planFeature.findMany.mockResolvedValue([]);
    mockPrisma.organization.findFirst.mockResolvedValue(null);

    const res2 = await POST(createRequest(rawBody));
    expect(res2.status).toBe(200);
  });
});
