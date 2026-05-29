import { NextRequest } from "next/server";
/**
 * Unit tests for app/api/stripe/webhook/route.ts — 503 on Redis failure.
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
vi.mock("stripe", () => ({
  default: vi.fn(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockRetrieveSub },
  })),
}));
vi.mock("@/lib/stripe", () => ({
  getPlanFromPriceId: vi.fn().mockReturnValue("PRO"),
  stripe: {
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockRetrieveSub },
  },
}));

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------
const mockPrismaUpdate = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn().mockResolvedValue({ id: "user-1", plan: "FREE" }),
      update: mockPrismaUpdate,
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

describe("Stripe webhook — first-payment Redis failure", () => {
  beforeEach(() => {
    redisReturnValues.length = 0;
    redisCallIdx = 0;
    vi.clearAllMocks();

    mockConstructEvent.mockReturnValue(fakeEvent("invoice.payment_succeeded"));
    mockRetrieveSub.mockResolvedValue({
      items: { data: [{ price: { id: "price_pro" } }] },
    });

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

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
  // Redis first-payment check fails → 503
  // ────────────────────────────────────────────

  it("should return 503 when Redis first-payment set throws", async () => {
    redisReturnValues.push({ type: "ok" }, { type: "throw" });
    const POST = await getHandler();
    const res = await POST(createReq());

    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("10");
  });

  it("should return error body when first-payment fails", async () => {
    redisReturnValues.push({ type: "ok" }, { type: "throw" });
    const POST = await getHandler();
    const res = await POST(createReq());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toContain("Service temporarily unavailable");
  });

  // ────────────────────────────────────────────
  // Redis works → proceeds normally
  // ────────────────────────────────────────────

  it("should grant credits on first payment when Redis returns OK", async () => {
    redisReturnValues.push({ type: "ok" }, { type: "ok" });
    const POST = await getHandler();
    const res = await POST(createReq());

    expect(res.status).toBe(200);
    expect(mockPrismaUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({
          credits: { increment: expect.any(Number) },
        }),
      }),
    );
  });

  it("should return received: true on success", async () => {
    redisReturnValues.push({ type: "ok" }, { type: "ok" });
    const POST = await getHandler();
    const res = await POST(createReq());
    const body = await res.json();

    expect(body).toHaveProperty("received", true);
  });

  // ────────────────────────────────────────────
  // Idempotency check failure → 503
  // ────────────────────────────────────────────

  it("should return 503 when idempotency Redis check throws", async () => {
    redisReturnValues.push({ type: "throw" });
    const POST = await getHandler();
    const res = await POST(createReq());

    expect(res.status).toBe(503);
  });

  // ────────────────────────────────────────────
  // First-payment already processed (recurring)
  // ────────────────────────────────────────────

  it("should not grant credits on recurring payment (SET NX returns null)", async () => {
    redisReturnValues.push({ type: "ok" }, { type: "null" });
    const POST = await getHandler();
    const res = await POST(createReq());

    expect(res.status).toBe(200);
    // prisma update should have been called (plan update)
    expect(mockPrismaUpdate).toHaveBeenCalled();
    // but NOT with credits increment
    const calls = mockPrismaUpdate.mock.calls.filter(
      (c: any) => c[0]?.data?.credits?.increment !== undefined,
    );
    expect(calls.length).toBe(0);
  });

  // ────────────────────────────────────────────
  // Non-invoice events
  // ────────────────────────────────────────────

  it("should return 200 for non-invoice events", async () => {
    mockConstructEvent.mockReturnValue(fakeEvent("customer.subscription.updated"));
    redisReturnValues.push({ type: "ok" });
    const POST = await getHandler();
    const res = await POST(createReq());

    expect(res.status).toBe(200);
  });
});
