// ================================================================
// Stripe Webhook Route — Comprehensive Test Suite
// POST /api/stripe/webhook
// ================================================================
// Tests cover: body size limits, signature verification,
// rate limiting, checkout.session.completed (credit assignment),
// FF handler integration (primary processor), error recovery,
// and response format.
// ================================================================

import { NextRequest, NextResponse } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ================================================================
// Mock references
// ================================================================
const mockHeadersGet = vi.fn();
const mockRedisSet = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockConstructEvent = vi.fn();
const mockStripeRetrieve = vi.fn();
const mockGetPlanFromPriceId = vi.fn();
const mockPrismaFindFirst = vi.fn();
const mockPrismaUpdate = vi.fn();
const mockCreateStripeWebhookHandler = vi.fn();
const mockFFHandleEvent = vi.fn();
const mockLogAudit = vi.fn();

// ================================================================
// Module mocks — hoisted before imports
// ================================================================
vi.mock("next/headers", () => ({
  headers: vi.fn(() => ({ get: mockHeadersGet })),
}));

vi.mock("@/lib/redis", () => ({
  redis: { set: mockRedisSet },
  checkRateLimit: mockCheckRateLimit,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: mockPrismaFindFirst, update: mockPrismaUpdate },
  },
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockStripeRetrieve },
  },
  getPlanFromPriceId: mockGetPlanFromPriceId,
  PRICES: { STARTER: "price_starter", PRO: "price_pro", BUSINESS: "price_business" },
}));

vi.mock("@/services/auditLogger", () => ({
  AuditAction: { SUBSCRIPTION_CANCELLED: "SUBSCRIPTION_CANCELLED" },
  AuditResource: { SUBSCRIPTION: "Subscription" },
  logAudit: mockLogAudit,
}));

vi.mock("@/services/feature-flags/stripeWebhookHandler", () => ({
  createStripeWebhookHandler: mockCreateStripeWebhookHandler,
  // Real handler exposes handleVerifiedEvent; the route now calls it with the
  // already-verified event instead of re-verifying via handleWebhookEvent.
}));

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

function makeEvent(type: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    data: { object: overrides },
  };
}

let POST: (req: NextRequest) => Promise<NextResponse>;

// ================================================================
// Suite
// ================================================================
describe("Stripe Webhook Route — POST /api/stripe/webhook", () => {
  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    process.env.STRIPE_SECRET_KEY = "sk_test_xxx";
    process.env.STRIPE_PRO_PRICE_ID = "price_pro";
    process.env.STRIPE_STARTER_PRICE_ID = "price_starter";
    process.env.STRIPE_BUSINESS_PRICE_ID = "price_business";
    const mod = await import("@/app/api/stripe/webhook/route");
    POST = mod.POST;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockHeadersGet.mockReturnValue("valid_sig");
    mockCheckRateLimit.mockResolvedValue({
      success: true,
      remaining: 59,
      resetAt: Date.now() + 60_000,
      limit: 60,
    });
    mockRedisSet.mockResolvedValue("OK");
    mockConstructEvent.mockReturnValue(makeEvent("unhandled.type", {}));
    mockCreateStripeWebhookHandler.mockResolvedValue({
      handleVerifiedEvent: mockFFHandleEvent,
    });
    mockFFHandleEvent.mockResolvedValue({ received: true });
    mockPrismaFindFirst.mockResolvedValue(null);
  });

  // ================================================================
  // SECTION 1: Body size & header checks
  // ================================================================
  describe("body size & header checks", () => {
    it("1. missing stripe-signature header → 400", async () => {
      mockHeadersGet.mockReturnValue(null);
      const res = await POST(createRequest("{}"));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Missing signature header" });
    });

    it("2. content-length > 1MB → 413", async () => {
      const oversized = 1024 * 1024 + 1;
      const res = await POST(createRequest("{}", { "content-length": String(oversized) }));
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ error: "Request body too large" });
    });

    it("3. actual body > 1MB (second check) → 413", async () => {
      const hugeBody = "x".repeat(1024 * 1024 + 1);
      const res = await POST(createRequest(hugeBody, { "content-length": "2" }));
      expect(res.status).toBe(413);
    });

    it("4. invalid signature → constructEvent throws → 400", async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error("Invalid signature");
      });
      const res = await POST(createRequest("{}"));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid signature" });
    });
  });

  // ================================================================
  // SECTION 2: Checkout.session.completed (credit assignment)
  // ================================================================
  describe("checkout.session.completed", () => {
    beforeEach(() => {
      mockConstructEvent.mockReturnValue(
        makeEvent("checkout.session.completed", {
          customer: "cus_test",
          subscription: "sub_test",
        }),
      );
    });

    it("5. creates subscription with initial credits", async () => {
      mockRedisSet.mockResolvedValue("OK");
      mockPrismaFindFirst.mockResolvedValue({ id: "user_1", stripeCustomerId: "cus_test" });
      mockStripeRetrieve.mockResolvedValue({
        items: { data: [{ price: { id: "price_pro" } }] },
      });
      mockGetPlanFromPriceId.mockReturnValue("PRO");

      const res = await POST(createRequest("{}"));

      expect(res.status).toBe(200);
      expect(mockPrismaUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "user_1" },
          data: expect.objectContaining({ plan: "PRO" }),
        }),
      );
    });

    it("6. unknown priceId → graceful (no update)", async () => {
      mockRedisSet.mockResolvedValue("OK");
      mockPrismaFindFirst.mockResolvedValue({ id: "user_1", stripeCustomerId: "cus_test" });
      mockStripeRetrieve.mockResolvedValue({
        items: { data: [{ price: { id: "price_unknown" } }] },
      });
      mockGetPlanFromPriceId.mockReturnValue(null);

      const res = await POST(createRequest("{}"));
      expect(res.status).toBe(200);
      expect(mockPrismaUpdate).not.toHaveBeenCalled();
    });

    it("7. user not found → logged, no crash", async () => {
      mockRedisSet.mockResolvedValue("OK");
      mockPrismaFindFirst.mockResolvedValue(null);

      const res = await POST(createRequest("{}"));
      expect(res.status).toBe(200);
      expect(mockPrismaUpdate).not.toHaveBeenCalled();
    });

    it("8. duplicate checkout event → deduplicated via isolated Redis key", async () => {
      mockRedisSet.mockResolvedValue(null); // NX returns null → duplicate

      const res = await POST(createRequest("{}"));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ received: true, deduplicated: true });
      expect(mockRedisSet).toHaveBeenCalledWith(
        expect.stringMatching(/^stripe:checkout:/),
        "1",
        "EX",
        86400,
        "NX",
      );
      expect(mockPrismaFindFirst).not.toHaveBeenCalled();
    });

    it("9. Redis down for checkout idempotency → proceeds (non-fatal)", async () => {
      mockRedisSet.mockRejectedValue(new Error("Redis down"));
      mockPrismaFindFirst.mockResolvedValue(null);

      const res = await POST(createRequest("{}"));
      expect(res.status).toBe(200);
    });
  });

  // ================================================================
  // SECTION 3: FF handler — primary event processor
  // ================================================================
  describe("FF handler integration", () => {
    it("10. FF handler called for subscription events (verified event passed through)", async () => {
      mockConstructEvent.mockReturnValue(
        makeEvent("customer.subscription.updated", {
          customer: "cus_test",
          id: "sub_test",
          items: { data: [{ price: { id: "price_pro" } }] },
          status: "active",
        }),
      );

      const res = await POST(createRequest("{}"));

      expect(res.status).toBe(200);
      expect(mockCreateStripeWebhookHandler).toHaveBeenCalledTimes(1);
      expect(mockFFHandleEvent).toHaveBeenCalledTimes(1);
      // The already-verified event object is passed, NOT (body, signature).
      expect(mockFFHandleEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "customer.subscription.updated", id: expect.any(String) }),
      );
    });

    it("10b. signature verified once — route does NOT re-verify in FF path", async () => {
      mockConstructEvent.mockReturnValue(
        makeEvent("customer.subscription.updated", {
          customer: "cus_test",
          id: "sub_test",
          items: { data: [{ price: { id: "price_pro" } }] },
          status: "active",
        }),
      );

      await POST(createRequest("{}"));

      // Only the route's own verification; the handler must not re-verify.
      expect(mockConstructEvent).toHaveBeenCalledTimes(1);
    });

    it("11. FF handler failure → 500 (primary handler, not optional)", async () => {
      mockConstructEvent.mockReturnValue(
        makeEvent("customer.subscription.updated", {
          customer: "cus_test",
          id: "sub_test",
          items: { data: [{ price: { id: "price_pro" } }] },
          status: "active",
        }),
      );
      mockFFHandleEvent.mockRejectedValue(new Error("FF handler crashed"));

      const res = await POST(createRequest("{}"));

      expect(res.status).toBe(500);
    });

    it("12. FF createStripeWebhookHandler throws → 500", async () => {
      mockConstructEvent.mockReturnValue(
        makeEvent("customer.subscription.updated", {
          customer: "cus_test",
          id: "sub_test",
          items: { data: [{ price: { id: "price_pro" } }] },
          status: "active",
        }),
      );
      mockCreateStripeWebhookHandler.mockRejectedValue(new Error("FF init failed"));

      const res = await POST(createRequest("{}"));
      expect(res.status).toBe(500);
    });

    it("13. FF handler returns deduplicated → acknowledged", async () => {
      mockConstructEvent.mockReturnValue(
        makeEvent("customer.subscription.updated", {
          customer: "cus_test",
          id: "sub_test",
          items: { data: [{ price: { id: "price_pro" } }] },
          status: "active",
        }),
      );
      mockFFHandleEvent.mockResolvedValue({ received: true, deduplicated: true });

      const res = await POST(createRequest("{}"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it("14. unhandled event type → still calls FF handler if relevant", async () => {
      mockConstructEvent.mockReturnValue(
        makeEvent("completely.random.event", { something: "irrelevant" }),
      );

      const res = await POST(createRequest("{}"));

      expect(res.status).toBe(200);
      // FF handler is still created and called (it handles "default" case gracefully)
      expect(mockCreateStripeWebhookHandler).toHaveBeenCalledTimes(1);
      expect(mockFFHandleEvent).toHaveBeenCalled();
    });

    it("15. customer.subscription.deleted → audit log written", async () => {
      mockConstructEvent.mockReturnValue(
        makeEvent("customer.subscription.deleted", {
          customer: "cus_test",
          id: "sub_del",
        }),
      );
      mockFFHandleEvent.mockResolvedValue({
        received: true,
        eventType: "customer.subscription.deleted",
      });
      mockPrismaFindFirst.mockResolvedValue({ id: "user_1", stripeCustomerId: "cus_test" });
      mockLogAudit.mockResolvedValue(undefined);

      const res = await POST(createRequest("{}"));

      expect(res.status).toBe(200);
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user_1",
          action: "SUBSCRIPTION_CANCELLED",
          resource: "Subscription",
        }),
      );
    });

    it("16. audit log failure → non-fatal (still 200)", async () => {
      mockConstructEvent.mockReturnValue(
        makeEvent("customer.subscription.deleted", {
          customer: "cus_test",
          id: "sub_del",
        }),
      );
      mockFFHandleEvent.mockResolvedValue({
        received: true,
        eventType: "customer.subscription.deleted",
      });
      mockPrismaFindFirst.mockResolvedValue({ id: "user_1", stripeCustomerId: "cus_test" });
      mockLogAudit.mockRejectedValue(new Error("Audit DB down"));

      const res = await POST(createRequest("{}"));
      expect(res.status).toBe(200);
    });
  });

  // ================================================================
  // SECTION 3b: Regression #1 — idempotency/infra failure must NOT be
  // acknowledged with 200. A transient failure (received: false) must
  // surface as 503 so Stripe retries instead of silently dropping it.
  // ================================================================
  describe("regression #1 — handler failure → 503 (not 200)", () => {
    it("R1. FF handler returns received:false → 503", async () => {
      mockConstructEvent.mockReturnValue(
        makeEvent("customer.subscription.updated", {
          customer: "cus_test",
          id: "sub_test",
          items: { data: [{ price: { id: "price_pro" } }] },
          status: "active",
        }),
      );
      mockFFHandleEvent.mockResolvedValue({
        received: false,
        error: "Service temporarily unavailable",
      });

      const res = await POST(createRequest("{}"));

      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({
        error: "Service temporarily unavailable",
      });
    });

    it("R1. FF handler returns received:false without error message → 503 default body", async () => {
      mockConstructEvent.mockReturnValue(makeEvent("invoice.payment_failed", {}));
      mockFFHandleEvent.mockResolvedValue({ received: false });

      const res = await POST(createRequest("{}"));

      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "Event processing failed" });
    });
  });

  // ================================================================
  // SECTION 4: Error recovery
  // ================================================================
  describe("error recovery", () => {
    it("17. rate limiter blocks → 429", async () => {
      mockCheckRateLimit.mockResolvedValue({
        success: false,
        remaining: 0,
        resetAt: Date.now() + 60_000,
        limit: 60,
      });

      const res = await POST(createRequest("{}"));
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: "Too many requests" });
    });

    it("18. Redis down for rate limiting → allows through gracefully", async () => {
      mockCheckRateLimit.mockRejectedValue(new Error("Redis down"));

      const res = await POST(createRequest("{}"));
      expect(res.status).toBe(200);
    });
  });

  // ================================================================
  // SECTION 5: Response format guarantees
  // ================================================================
  describe("response format", () => {
    it("19. success response: { received: true }", async () => {
      const res = await POST(createRequest("{}"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it("20. error response: { error: string }", async () => {
      mockHeadersGet.mockReturnValue(null);
      const res = await POST(createRequest("{}"));
      const body = await res.json();
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });
  });

  // ================================================================
  // SECTION 6: Additional edge cases
  // ================================================================
  describe("additional edge cases", () => {
    it("21. empty body → signature verification fails → 400", async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error("No signatures found");
      });
      const res = await POST(createRequest(""));
      expect(res.status).toBe(400);
    });

    it("22. content-length 0 with empty body → 400 gracefully", async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error("Invalid signature");
      });
      const res = await POST(createRequest("", { "content-length": "0" }));
      expect(res.status).toBe(400);
    });

    it("23. FF createStripeWebhookHandler returns null handler → 500", async () => {
      mockConstructEvent.mockReturnValue(
        makeEvent("customer.subscription.updated", {
          customer: "cus_test",
          id: "sub_test",
          items: { data: [{ price: { id: "price_pro" } }] },
          status: "active",
        }),
      );
      mockCreateStripeWebhookHandler.mockResolvedValue(null);

      const res = await POST(createRequest("{}"));
      expect(res.status).toBe(500);
    });

    it("24. non-subscription event still reaches FF handler gracefully", async () => {
      mockConstructEvent.mockReturnValue(makeEvent("customer.subscription.created", {}));

      const res = await POST(createRequest("{}"));
      expect(res.status).toBe(200);
    });

    it("25. content-type application/x-www-form-urlencoded works", async () => {
      const res = await POST(
        createRequest("{}", { "content-type": "application/x-www-form-urlencoded" }),
      );
      expect(res.status).toBe(200);
    });
  });
});
