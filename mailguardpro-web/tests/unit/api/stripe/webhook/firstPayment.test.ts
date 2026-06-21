import { NextRequest } from "next/server";
/**
 * Unit tests for app/api/stripe/webhook/route.ts — checkIdempotency behavior.
 *
 * The new checkIdempotency() function uses a two-layer approach:
 *   Layer 1: Redis SET NX (fast path)
 *   Layer 2: PostgreSQL stripeEvent.create (reliable fallback)
 *
 * Note: The route module reads env vars at import time. We must reset
 * modules and stub env BEFORE each dynamic import to get a fresh evaluation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock next/headers
// ---------------------------------------------------------------------------
vi.mock("next/headers", () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: (key: string) => {
        if (key === "stripe-signature") return "t=123,v1=test";
        return null;
      },
    }),
  ),
}));

// ---------------------------------------------------------------------------
// Redis mock — controlled per test via mockChainIndex
// ---------------------------------------------------------------------------
// We use a simple array of return values consumed sequentially
const redisReturnValues: Array<{ type: "ok" | "throw" | "null"; value?: any }> = [];
let redisCallIdx = 0;

const mockRedisSet = vi.hoisted(() =>
  vi.fn().mockImplementation(() => {
    const cfg = redisReturnValues[redisCallIdx++];
    if (!cfg || cfg.type === "ok") return Promise.resolve("OK");
    if (cfg.type === "null") return Promise.resolve(null);
    if (cfg.type === "throw") return Promise.reject(new Error(cfg.value || "Redis error"));
    return Promise.resolve("OK");
  }),
);

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: mockRedisSet,
    setex: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  },
  checkRateLimit: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock Stripe + lib/stripe
// ---------------------------------------------------------------------------
const mockConstructEvent = vi.hoisted(() => vi.fn());
const mockRetrieveSub = vi.hoisted(() => vi.fn());
const mockGetPlanFromPriceId = vi.hoisted(() => vi.fn().mockReturnValue("PRO"));
vi.mock("stripe", () => ({
  default: vi.fn(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockRetrieveSub },
  })),
}));
vi.mock("@/lib/stripe", () => ({
  getPlanFromPriceId: mockGetPlanFromPriceId,
  stripe: {
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockRetrieveSub },
  },
}));

// ---------------------------------------------------------------------------
// Prisma mock — includes stripeEvent for idempotency fallback
// ---------------------------------------------------------------------------
const mockPrismaFindFirst = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: "user-1", plan: "FREE" }),
);
const mockPrismaUpdate = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const mockStripeEventCreate = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: mockPrismaFindFirst,
      update: mockPrismaUpdate,
    },
    stripeEvent: {
      create: mockStripeEventCreate,
    },
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  },
}));
vi.mock("@/services/auditLogger", () => ({
  logAudit: vi.fn(),
  AuditAction: {},
  AuditResource: {},
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fakeEvent(type: string) {
  return {
    id: `evt_${Date.now()}`,
    type,
    data: { object: { customer: "cus_1", subscription: "sub_1" } },
  };
}

function createReq(): NextRequest {
  return new NextRequest("https://example.com/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "t=123,v1=test" },
    body: JSON.stringify({}),
  });
}

describe("Stripe webhook — checkIdempotency", () => {
  /** Re-apply mock implementations that vi.restoreAllMocks destroys */
  function reapplyDefaultMocks() {
    mockRedisSet.mockImplementation(() => {
      const cfg = redisReturnValues[redisCallIdx++];
      if (!cfg || cfg.type === "ok") return Promise.resolve("OK");
      if (cfg.type === "null") return Promise.resolve(null);
      if (cfg.type === "throw") return Promise.reject(new Error(cfg.value || "Redis error"));
      return Promise.resolve("OK");
    });
    mockPrismaFindFirst.mockResolvedValue({ id: "user-1", plan: "FREE" });
    mockPrismaUpdate.mockResolvedValue({});
    mockStripeEventCreate.mockResolvedValue({});
    mockConstructEvent.mockReturnValue(fakeEvent("invoice.payment_succeeded"));
    mockRetrieveSub.mockResolvedValue({
      items: { data: [{ price: { id: "price_pro" } }] },
    });
    mockGetPlanFromPriceId.mockReturnValue("PRO");
  }

  beforeEach(() => {
    redisReturnValues.length = 0;
    redisCallIdx = 0;
    vi.clearAllMocks();

    // Re-apply implementations that vi.restoreAllMocks in afterEach destroys
    reapplyDefaultMocks();

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  // We override mockReturnValue/ResolvedValue per-test when non-default behavior is needed

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  /** Import the POST handler with required env vars */
  async function getHandler() {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.resetModules(); // force fresh module evaluation
    const mod = await import("@/app/api/stripe/webhook/route");
    return mod.POST;
  }

  // ────────────────────────────────────────────
  // Idempotency: Redis OK → process event
  // ────────────────────────────────────────────

  it("should return 200 when idempotency check passes via Redis", async () => {
    redisReturnValues.push({ type: "ok" });
    const POST = await getHandler();
    const res = await POST(createReq());

    expect(res.status).toBe(200);
  });

  it("should update user plan (not credits) on invoice.payment_succeeded", async () => {
    redisReturnValues.push({ type: "ok" });
    const POST = await getHandler();
    const res = await POST(createReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveProperty("received", true);
    // Plan should be updated
    expect(mockPrismaUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({
          plan: "PRO",
        }),
      }),
    );
    // No credits increment in invoice.payment_succeeded (credits are in checkout.session.completed)
    const creditCalls = mockPrismaUpdate.mock.calls.filter(
      (c: any) => c[0]?.data?.credits?.increment !== undefined,
    );
    expect(creditCalls.length).toBe(0);
  });

  // ────────────────────────────────────────────
  // Idempotency: Duplicate event
  // ────────────────────────────────────────────

  it("should return 200 with deduplicated:true when event already processed (Redis NX returns null)", async () => {
    redisReturnValues.push({ type: "null" });
    const POST = await getHandler();
    const res = await POST(createReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.deduplicated).toBe(true);
    // No DB updates for duplicates
    expect(mockPrismaUpdate).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────
  // Idempotency: Redis fails, PostgreSQL fallback
  // ────────────────────────────────────────────

  it("should fall back to PostgreSQL when Redis throws and proceed if PG succeeds", async () => {
    redisReturnValues.push({ type: "throw" });
    mockStripeEventCreate.mockResolvedValue({}); // PG succeeds
    const POST = await getHandler();
    const res = await POST(createReq());

    expect(res.status).toBe(200);
    expect(mockStripeEventCreate).toHaveBeenCalled();
  });

  it("should return 503 when both Redis and PostgreSQL idempotency checks fail", async () => {
    redisReturnValues.push({ type: "throw" });
    mockStripeEventCreate.mockRejectedValue(new Error("PG connection failed"));
    const POST = await getHandler();
    const res = await POST(createReq());

    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("10");
  });

  it("should return error body when both idempotency layers fail", async () => {
    redisReturnValues.push({ type: "throw" });
    mockStripeEventCreate.mockRejectedValue(new Error("PG connection failed"));
    const POST = await getHandler();
    const res = await POST(createReq());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toContain("Service temporarily unavailable");
  });

  it("should return duplicate when PostgreSQL throws P2002 (Prisma unique constraint)", async () => {
    redisReturnValues.push({ type: "throw" });
    mockStripeEventCreate.mockRejectedValue({ code: "P2002" });
    const POST = await getHandler();
    const res = await POST(createReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.deduplicated).toBe(true);
    // No DB updates for duplicates
    expect(mockPrismaUpdate).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────
  // Success response shape
  // ────────────────────────────────────────────

  it("should return received: true on success", async () => {
    redisReturnValues.push({ type: "ok" });
    const POST = await getHandler();
    const res = await POST(createReq());
    const body = await res.json();

    expect(body).toHaveProperty("received", true);
  });

  // ────────────────────────────────────────────
  // Non-invoice events
  // ────────────────────────────────────────────

  it("should return 200 for unknown event types (fallthrough)", async () => {
    mockConstructEvent.mockReturnValue(fakeEvent("charge.succeeded"));
    redisReturnValues.push({ type: "ok" });
    const POST = await getHandler();
    const res = await POST(createReq());

    expect(res.status).toBe(200);
  });

  it("should throw at import when STRIPE_WEBHOOK_SECRET is not defined", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    vi.resetModules();
    await expect(import("@/app/api/stripe/webhook/route")).rejects.toThrow(
      "STRIPE_WEBHOOK_SECRET is not defined",
    );
    vi.unstubAllEnvs();
  });
});
