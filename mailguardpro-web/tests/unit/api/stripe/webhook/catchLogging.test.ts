import { NextRequest } from "next/server";
/**
 * Unit tests for L-04 — Stripe webhook idempotency error logging.
 *
 * Verifies that when checkIdempotency() fails in various ways, the correct
 * log messages are emitted via loggerStripe:
 *   - Redis unavailable → loggerStripe.warn "Redis unavailable"
 *   - PostgreSQL fallback fails → loggerStripe.error "PostgreSQL idempotency check failed"
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
// Redis mock — sequential call control via counter
// ---------------------------------------------------------------------------
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

const mockGetPlanFromPriceId = vi.hoisted(() => vi.fn().mockReturnValue("PRO"));
vi.mock("@/lib/stripe", () => ({
  getPlanFromPriceId: mockGetPlanFromPriceId,
  stripe: {
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockRetrieveSub },
  },
}));

// ---------------------------------------------------------------------------
// Prisma mock — includes stripeEvent for fallback control
// ---------------------------------------------------------------------------
const mockStripeEventCreate = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const mockPrismaFindFirst = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: "user-1", plan: "FREE" }),
);
const mockPrismaUpdate = vi.hoisted(() => vi.fn().mockResolvedValue({}));
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
// Logger mock — the route uses loggerStripe.warn/error (pino-style), not console
// ---------------------------------------------------------------------------
const mockLoggerStripeWarn = vi.hoisted(() => vi.fn());
const mockLoggerStripeError = vi.hoisted(() => vi.fn());
const mockLogError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
  loggerApi: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  loggerStripe: {
    info: vi.fn(),
    warn: mockLoggerStripeWarn,
    error: mockLoggerStripeError,
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
  logError: mockLogError,
  logRequest: vi.fn(),
  logMetrics: vi.fn(),
  createRequestLogger: vi.fn(),
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

describe("Stripe catch logging [L-04]", () => {
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

  it("should log warning when Redis is unavailable and PostgreSQL fallback succeeds", async () => {
    // Redis throws → fallback to PostgreSQL → PG succeeds
    redisReturnValues.push({ type: "throw" });
    mockStripeEventCreate.mockResolvedValue({}); // PG fallback succeeds

    const POST = await getHandler();
    const res = await POST(createReq());

    expect(res.status).toBe(200); // PG fallback handled it

    const redisUnavailableLogs = mockLoggerStripeWarn.mock.calls.filter(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("Redis unavailable"),
    );
    expect(redisUnavailableLogs.length).toBeGreaterThanOrEqual(1);
    expect(redisUnavailableLogs[0][0]).toBe(
      "Redis unavailable — using PostgreSQL idempotency fallback",
    );
  });

  it("should log error when PostgreSQL fallback also fails", async () => {
    // Redis throws → fallback to PostgreSQL → PG also throws
    redisReturnValues.push({ type: "throw" });
    mockStripeEventCreate.mockRejectedValue(new Error("PG connection failed"));

    const POST = await getHandler();
    const res = await POST(createReq());

    expect(res.status).toBe(503);

    // Should log BOTH the Redis unavailable warning AND the PG error
    const redisUnavailableLogs = mockLoggerStripeWarn.mock.calls.filter(
      (call: any[]) => typeof call[0] === "string" && call[0].includes("Redis unavailable"),
    );
    // loggerStripe.error uses pino signature: error(dataObject, messageString)
    const pgErrorLogs = mockLoggerStripeError.mock.calls.filter(
      (call: any[]) =>
        typeof call[1] === "string" && call[1].includes("PostgreSQL idempotency check failed"),
    );

    expect(redisUnavailableLogs.length).toBeGreaterThanOrEqual(1);
    expect(pgErrorLogs.length).toBeGreaterThanOrEqual(1);
  });

  it("should return 503 when both idempotency layers fail", async () => {
    redisReturnValues.push({ type: "throw" });
    mockStripeEventCreate.mockRejectedValue(new Error("PG connection failed"));

    const POST = await getHandler();
    const res = await POST(createReq());

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("Service temporarily unavailable");
  });
});
