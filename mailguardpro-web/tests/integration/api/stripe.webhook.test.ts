import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted helpers — set env vars before module evaluation
// ---------------------------------------------------------------------------
const { mockHeadersGet } = vi.hoisted(() => {
  const mockHeadersGet = vi.fn();
  return { mockHeadersGet };
});

vi.hoisted(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret_12345";
  process.env.STRIPE_DOWNGRADE_ATTEMPT_THRESHOLD = "3";
});

// ---------------------------------------------------------------------------
// Module mocks — explicit for every dependency, not relying on setup.ts
// ---------------------------------------------------------------------------
vi.mock("next/headers", () => ({
  headers: vi.fn(() => ({
    get: mockHeadersGet,
  })),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
    subscriptions: {
      retrieve: vi.fn(),
    },
  },
  getPlanFromPriceId: vi.fn(),
  PRICES: {
    STARTER: "price_starter_test",
    PRO: "price_pro_test",
    BUSINESS: "price_business_test",
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    stripeEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    set: vi.fn().mockResolvedValue("OK"),
    get: vi.fn().mockResolvedValue(null),
  },
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  deleteCached: vi.fn().mockResolvedValue(undefined),
  checkRateLimit: vi.fn(() =>
    Promise.resolve({
      success: true,
      resetAt: Date.now() + 60000,
      remaining: 100,
    }),
  ),
}));

vi.mock("@/services/auditLogger", () => ({
  AuditAction: { SUBSCRIPTION_CANCELLED: "SUBSCRIPTION_CANCELLED" },
  AuditResource: { SUBSCRIPTION: "Subscription" },
  logAudit: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------
import { POST } from "@/app/api/stripe/webhook/route";
import { loggerStripe } from "@/lib/logger";

describe("POST /api/stripe/webhook", () => {
  let stripe: any;
  let prisma: any;
  let redis: any;

  beforeAll(async () => {
    const stripeModule = await import("@/lib/stripe");
    stripe = stripeModule.stripe;
    const prismaModule = await import("@/lib/prisma");
    prisma = prismaModule.prisma;
    const redisModule = await import("@/lib/redis");
    redis = redisModule.redis;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: signature header present and valid
    mockHeadersGet.mockReturnValue("test_signature");
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      id: "evt_test_id",
      type: "checkout.session.completed",
      data: { object: {} },
    });
    // Default: redis.set succeeds (NX returns "OK")
    vi.mocked(redis.set).mockReset();
    vi.mocked(redis.set).mockResolvedValue("OK");
    // Default: no user found in DB
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.user.update).mockResolvedValue({});
  });

  // -----------------------------------------------------------------------
  // Request validation
  // -----------------------------------------------------------------------
  it("should return 400 when stripe-signature header is missing", async () => {
    mockHeadersGet.mockReturnValue(null);

    const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(req);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("Missing signature header");
  });

  it("should return 400 when signature verification fails", async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(req);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("Invalid signature");
  });

  // -----------------------------------------------------------------------
  // Idempotency
  // -----------------------------------------------------------------------
  it("should return 200 with deduplicated:true when event already processed", async () => {
    // Redis.set with NX returns null when key already exists
    vi.mocked(redis.set).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.received).toBe(true);
    expect(json.deduplicated).toBe(true);
  });

  it("should fall back to PostgreSQL when Redis is unavailable for idempotency check", async () => {
    vi.mocked(redis.set).mockRejectedValue(new Error("Redis connection refused"));

    const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(req);

    // checkIdempotency falls back to PostgreSQL when Redis throws
    // With PG fallback succeeding, the request proceeds normally
    expect(response.status).toBe(200);
  });

  // -----------------------------------------------------------------------
  // checkout.session.completed
  // -----------------------------------------------------------------------
  it("should handle checkout.session.completed event", async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      id: "evt_cs_test",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_123" } },
    });

    const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.received).toBe(true);
    // No db update expected for checkout.session.completed (currently just logs)
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // customer.subscription.updated
  // -----------------------------------------------------------------------
  it("should update user plan on customer.subscription.updated when active and mapped", async () => {
    const mockUser = { id: "user-1", plan: "FREE" };
    vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser);
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      id: "evt_sub_updated",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_updated_1",
          customer: "cus_123",
          status: "active",
          items: { data: [{ price: { id: "price_pro_test" } }] },
        },
      },
    });
    const { getPlanFromPriceId } = await import("@/lib/stripe");
    vi.mocked(getPlanFromPriceId).mockReturnValue("PRO");

    const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { stripeCustomerId: "cus_123" },
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: { plan: "PRO" },
      }),
    );
  });

  it("should revert to FREE on subscription updated when status is not active", async () => {
    const mockUser = { id: "user-1", plan: "PRO" };
    vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser);
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      id: "evt_sub_inactive",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_inactive_1",
          customer: "cus_123",
          status: "past_due",
          items: { data: [{ price: { id: "price_pro_test" } }] },
        },
      },
    });
    const { getPlanFromPriceId } = await import("@/lib/stripe");
    vi.mocked(getPlanFromPriceId).mockReturnValue("PRO");

    const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    // Even though price maps to PRO, status is past_due → FREE
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: { plan: "FREE" },
      }),
    );
  });

  it("should not update user on subscription updated when user not found (orphan)", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      id: "evt_orphan",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_orphan",
          customer: "cus_unknown",
          status: "active",
          items: { data: [{ price: { id: "price_starter_test" } }] },
        },
      },
    });

    const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // customer.subscription.deleted
  // -----------------------------------------------------------------------
  it("should revert to FREE and clear subscriptionId on subscription.deleted", async () => {
    const mockUser = { id: "user-1", plan: "PRO", stripeSubscriptionId: "sub_delete_1" };
    vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser);
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      id: "evt_sub_deleted",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_delete_1",
          customer: "cus_123",
        },
      },
    });
    const { logAudit } = await import("@/services/auditLogger");

    const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: { plan: "FREE", stripeSubscriptionId: null },
      }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        action: "SUBSCRIPTION_CANCELLED",
        resource: "Subscription",
      }),
    );
  });

  // -----------------------------------------------------------------------
  // invoice.payment_succeeded — first payment
  // -----------------------------------------------------------------------
  it("should update plan (not credits) on invoice.payment_succeeded", async () => {
    const mockUser = { id: "user-1", stripeCustomerId: "cus_123", plan: "STARTER" };
    vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser);
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      id: "evt_inv_first",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_001",
          customer: "cus_123",
          subscription: "sub_inv_1",
          attempt_count: 1,
        },
      },
    });
    const { getPlanFromPriceId } = await import("@/lib/stripe");
    vi.mocked(getPlanFromPriceId).mockReturnValue("STARTER");
    vi.mocked(redis.set).mockResolvedValue("OK");
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      id: "sub_inv_1",
      items: { data: [{ price: { id: "price_starter_test" } }] },
    });

    const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    // invoice.payment_succeeded only updates the plan (credits are handled in checkout.session.completed)
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({
          plan: "STARTER",
        }),
      }),
    );
  });

  it("should handle recurring payment without granting additional credits", async () => {
    const mockUser = { id: "user-1", stripeCustomerId: "cus_123", plan: "STARTER" };
    vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser);
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      id: "evt_inv_recurring",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_002",
          customer: "cus_123",
          subscription: "sub_inv_1",
          attempt_count: 1,
        },
      },
    });
    const { getPlanFromPriceId } = await import("@/lib/stripe");
    vi.mocked(getPlanFromPriceId).mockReturnValue("STARTER");
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      id: "sub_inv_1",
      items: { data: [{ price: { id: "price_starter_test" } }] },
    });
    // First redis.set call = idempotency check → returns "OK" (not duplicate)
    // Second redis.set call = first payment check → returns null (already set = recurring)
    vi.mocked(redis.set).mockReset();
    vi.mocked(redis.set).mockResolvedValueOnce("OK"); // idempotency passes
    vi.mocked(redis.set).mockResolvedValueOnce(null); // not first payment

    const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    // Should just update plan, no credit increment
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: { plan: "STARTER" },
      }),
    );
  });

  it("should emit warning when invoice.payment_succeeded has unknown priceId", async () => {
    const mockUser = { id: "user-1", stripeCustomerId: "cus_123" };
    vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser);
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      id: "evt_inv_unknown",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_003",
          customer: "cus_123",
          subscription: "sub_unknown",
          attempt_count: 1,
        },
      },
    });
    const { getPlanFromPriceId } = await import("@/lib/stripe");
    vi.mocked(getPlanFromPriceId).mockReturnValue(null);
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      id: "sub_unknown",
      items: { data: [{ price: { id: "price_unknown" } }] },
    });

    const stripeErrorSpy = vi.spyOn(loggerStripe, "error").mockImplementation(() => {});

    const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(stripeErrorSpy).toHaveBeenCalled();
    // Pino signature: loggerStripe.error(dataObj, messageString)
    expect(stripeErrorSpy.mock.calls[0][1]).toContain("unknown priceId");

    stripeErrorSpy.mockRestore();
  });

  it("should not crash when Redis is down during idempotency check", async () => {
    const mockUser = { id: "user-1", stripeCustomerId: "cus_123" };
    vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser);
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      id: "evt_inv_redis_down",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_004",
          customer: "cus_123",
          subscription: "sub_redis_down",
          attempt_count: 1,
        },
      },
    });
    const { getPlanFromPriceId } = await import("@/lib/stripe");
    vi.mocked(getPlanFromPriceId).mockReturnValue("PRO");
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      id: "sub_redis_down",
      items: { data: [{ price: { id: "price_pro_test" } }] },
    });
    // Redis throws → checkIdempotency falls back to PostgreSQL → PG succeeds
    vi.mocked(redis.set).mockReset();
    vi.mocked(redis.set).mockRejectedValue(new Error("Redis down"));

    const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    // Should update plan (credits not added in invoice handler in new code)
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({
          plan: "PRO",
        }),
      }),
    );
  });

  // -----------------------------------------------------------------------
  // invoice.payment_failed
  // -----------------------------------------------------------------------
  it("should downgrade user to FREE after threshold failed payments", async () => {
    const mockUser = { id: "user-1", stripeCustomerId: "cus_123", plan: "PRO" };
    vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser);
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      id: "evt_inv_fail",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_fail_1",
          customer: "cus_123",
          subscription: "sub_fail_1",
          attempt_count: 3,
        },
      },
    });

    const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: { plan: "FREE", stripeSubscriptionId: null },
      }),
    );
  });

  it("should not downgrade when payment failure attempts are below threshold", async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      id: "evt_inv_fail_below",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_fail_2",
          customer: "cus_123",
          subscription: "sub_fail_2",
          attempt_count: 1,
        },
      },
    });

    const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    // attempt_count (1) < threshold (3), so no downgrade
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("should not crash on payment failed when user not found", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      id: "evt_inv_fail_orphan",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_fail_3",
          customer: "cus_nobody",
          subscription: "sub_fail_3",
          attempt_count: 5,
        },
      },
    });

    const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Edge: unknown event type (fallthrough)
  // -----------------------------------------------------------------------
  it("should gracefully handle unknown event types", async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      id: "evt_unknown",
      type: "charge.succeeded",
      data: { object: { id: "ch_unknown" } },
    });

    const req = new NextRequest("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.received).toBe(true);
    // No DB ops for unknown events
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
