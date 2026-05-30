import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — explicit for every dependency
// ---------------------------------------------------------------------------
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-123", email: "test@example.com", name: "Test User" },
    }),
  ),
  handlers: { GET: vi.fn(), POST: vi.fn() },
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    customers: {
      create: vi.fn(),
      update: vi.fn(),
    },
    paymentMethods: {
      attach: vi.fn(),
    },
    subscriptions: {
      create: vi.fn(),
    },
  },
  getPlanFromPriceId: vi.fn(),
  PRICES: {
    STARTER: "price_starter_monthly",
    PRO: "price_pro_monthly",
    BUSINESS: "price_business_monthly",
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("@/services/auditLogger", () => ({
  AuditAction: { SUBSCRIPTION_CREATED: "SUBSCRIPTION_CREATED" },
  AuditResource: { SUBSCRIPTION: "Subscription" },
  logAudit: vi.fn(),
}));

// Mock crypto (used by subscribe route for idempotency key generation)
// Must include "default" export because the route uses `import crypto from "node:crypto"`
vi.mock("crypto", () => ({
  __esModule: true,
  default: {
    randomUUID: vi.fn(() => "test-uuid-12345"),
    randomBytes: vi.fn((size: number) => Buffer.alloc(size, "a")),
    createHmac: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn(() => Buffer.from("mock-signature")),
    })),
    createHash: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn(() => Buffer.from("mock-hash")),
    })),
    timingSafeEqual: vi.fn(() => true),
  },
  randomUUID: vi.fn(() => "test-uuid-12345"),
  randomBytes: vi.fn((size: number) => Buffer.alloc(size, "a")),
  createHmac: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => Buffer.from("mock-signature")),
  })),
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => Buffer.from("mock-hash")),
  })),
  timingSafeEqual: vi.fn(() => true),
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------
import { POST } from "@/app/api/v1/billing/subscribe/route";

describe("POST /api/v1/billing/subscribe", () => {
  let prisma: any;
  let stripe: any;
  let getPlanFromPriceId: any;
  let auth: any;

  beforeAll(async () => {
    const prismaModule = await import("@/lib/prisma");
    prisma = prismaModule.prisma;
    const stripeModule = await import("@/lib/stripe");
    stripe = stripeModule.stripe;
    getPlanFromPriceId = stripeModule.getPlanFromPriceId;
    const authModule = await import("@/lib/auth");
    auth = authModule.auth;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure Stripe env vars are set (checked at runtime inside POST handler)
    process.env.STRIPE_STARTER_PRICE_ID = "price_starter_monthly";
    process.env.STRIPE_PRO_PRICE_ID = "price_pro_monthly";
    process.env.STRIPE_BUSINESS_PRICE_ID = "price_business_monthly";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Authentication
  // -----------------------------------------------------------------------
  it("should return 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null);

    const req = new NextRequest("http://localhost:3000/api/v1/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ priceId: "price_pro_monthly", paymentMethodId: "pm_123" }),
      headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
    });
    const response = await POST(req);

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("Authentication required");
  });

  // -----------------------------------------------------------------------
  // Stripe configuration
  // -----------------------------------------------------------------------
  it("should return 500 when Stripe price IDs are not configured", async () => {
    // Temporarily clear env vars for this test
    delete process.env.STRIPE_STARTER_PRICE_ID;
    delete process.env.STRIPE_PRO_PRICE_ID;
    delete process.env.STRIPE_BUSINESS_PRICE_ID;

    const req = new NextRequest("http://localhost:3000/api/v1/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ priceId: "price_pro_monthly", paymentMethodId: "pm_123" }),
      headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
    });
    const response = await POST(req);

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("payment plans not configured");

    // Restore for other tests
    process.env.STRIPE_STARTER_PRICE_ID = "price_starter_monthly";
    process.env.STRIPE_PRO_PRICE_ID = "price_pro_monthly";
    process.env.STRIPE_BUSINESS_PRICE_ID = "price_business_monthly";
  });

  // -----------------------------------------------------------------------
  // Input validation
  // -----------------------------------------------------------------------
  it("should return 400 when priceId is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ paymentMethodId: "pm_123" }),
      headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
    });
    const response = await POST(req);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("priceId and paymentMethodId are required");
  });

  it("should return 400 when paymentMethodId is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ priceId: "price_pro_monthly" }),
      headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
    });
    const response = await POST(req);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("priceId and paymentMethodId are required");
  });

  it("should return 400 when priceId is invalid (unrecognized plan)", async () => {
    vi.mocked(getPlanFromPriceId).mockReturnValueOnce(null);

    const req = new NextRequest("http://localhost:3000/api/v1/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ priceId: "price_invalid", paymentMethodId: "pm_123" }),
      headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
    });
    const response = await POST(req);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("Invalid priceId");
  });

  // -----------------------------------------------------------------------
  // Successful subscription with existing Stripe customer
  // -----------------------------------------------------------------------
  it("should create subscription when user already has a stripeCustomerId", async () => {
    // User already has a Stripe customer ID
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      email: "test@example.com",
      name: "Test User",
      stripeCustomerId: "cus_existing",
    });

    vi.mocked(getPlanFromPriceId).mockReturnValue("PRO");
    vi.mocked(stripe.paymentMethods.attach).mockResolvedValue({});
    vi.mocked(stripe.customers.update).mockResolvedValue({});
    vi.mocked(stripe.subscriptions.create).mockResolvedValue({
      id: "sub_new_123",
      status: "incomplete",
      latest_invoice: {
        payment_intent: {
          client_secret: "pi_secret_test_123",
        },
      },
    });
    vi.mocked(prisma.user.update).mockResolvedValue({});

    const req = new NextRequest("http://localhost:3000/api/v1/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ priceId: "price_pro_monthly", paymentMethodId: "pm_123" }),
      headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data.subscriptionId).toBe("sub_new_123");
    expect(json.data.status).toBe("incomplete");
    expect(json.data.clientSecret).toBe("pi_secret_test_123");

    // Should NOT create a new Stripe customer (already exists)
    expect(stripe.customers.create).not.toHaveBeenCalled();

    // Should attach payment method and update customer
    expect(stripe.paymentMethods.attach).toHaveBeenCalledWith("pm_123", {
      customer: "cus_existing",
    });
    expect(stripe.customers.update).toHaveBeenCalledWith("cus_existing", {
      invoice_settings: { default_payment_method: "pm_123" },
    });

    // Should create subscription with idempotency key
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_existing",
        items: [{ price: "price_pro_monthly" }],
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^mg-sub-user-123-/),
      }),
    );

    // Should store subscription reference
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-123" },
        data: { stripeSubscriptionId: "sub_new_123" },
      }),
    );

    // Should log audit
    const { logAudit } = await import("@/services/auditLogger");
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        action: "SUBSCRIPTION_CREATED",
        resource: "Subscription",
        metadata: expect.objectContaining({
          plan: "price_pro_monthly",
          subscriptionId: "sub_new_123",
        }),
      }),
    );
  });

  // -----------------------------------------------------------------------
  // First-time subscriber — creates Stripe customer
  // -----------------------------------------------------------------------
  it("should create Stripe customer when user has no stripeCustomerId", async () => {
    // User found but no stripeCustomerId
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      email: "new@example.com",
      name: "New User",
      stripeCustomerId: null,
    });

    vi.mocked(getPlanFromPriceId).mockReturnValue("STARTER");
    vi.mocked(stripe.customers.create).mockResolvedValue({ id: "cus_new_456" });
    vi.mocked(stripe.paymentMethods.attach).mockResolvedValue({});
    vi.mocked(stripe.customers.update).mockResolvedValue({});
    vi.mocked(stripe.subscriptions.create).mockResolvedValue({
      id: "sub_new_456",
      status: "incomplete",
      latest_invoice: {
        payment_intent: {
          client_secret: "pi_secret_456",
        },
      },
    });
    vi.mocked(prisma.user.update).mockResolvedValue({});

    const req = new NextRequest("http://localhost:3000/api/v1/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ priceId: "price_starter_monthly", paymentMethodId: "pm_456" }),
      headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);

    // Should create Stripe customer
    expect(stripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@example.com",
        name: "New User",
        metadata: { userId: "user-123" },
      }),
    );

    // Should save stripeCustomerId to DB
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-123" },
        data: { stripeCustomerId: "cus_new_456" },
      }),
    );
  });

  it("should return 400 when user has no email (cannot create Stripe customer)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      email: null,
      name: "No Email User",
      stripeCustomerId: null,
    });

    vi.mocked(getPlanFromPriceId).mockReturnValue("STARTER");

    const req = new NextRequest("http://localhost:3000/api/v1/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ priceId: "price_starter_monthly", paymentMethodId: "pm_456" }),
      headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
    });
    const response = await POST(req);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("User email is required");
  });

  // -----------------------------------------------------------------------
  // Response with clientSecret
  // -----------------------------------------------------------------------
  it("should include clientSecret when latest_invoice has payment_intent", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      email: "test@example.com",
      name: "Test User",
      stripeCustomerId: "cus_existing",
    });

    vi.mocked(getPlanFromPriceId).mockReturnValue("PRO");
    vi.mocked(stripe.paymentMethods.attach).mockResolvedValue({});
    vi.mocked(stripe.customers.update).mockResolvedValue({});
    vi.mocked(stripe.subscriptions.create).mockResolvedValue({
      id: "sub_secret_test",
      status: "incomplete",
      latest_invoice: {
        payment_intent: {
          client_secret: "pi_secret_abc123",
        },
      },
    });
    vi.mocked(prisma.user.update).mockResolvedValue({});

    const req = new NextRequest("http://localhost:3000/api/v1/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ priceId: "price_pro_monthly", paymentMethodId: "pm_789" }),
      headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.clientSecret).toBe("pi_secret_abc123");
  });

  it("should return undefined clientSecret when latest_invoice has no payment_intent", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      email: "test@example.com",
      name: "Test User",
      stripeCustomerId: "cus_existing",
    });

    vi.mocked(getPlanFromPriceId).mockReturnValue("PRO");
    vi.mocked(stripe.paymentMethods.attach).mockResolvedValue({});
    vi.mocked(stripe.customers.update).mockResolvedValue({});
    vi.mocked(stripe.subscriptions.create).mockResolvedValue({
      id: "sub_no_secret",
      status: "active",
      latest_invoice: {},
    });
    vi.mocked(prisma.user.update).mockResolvedValue({});

    const req = new NextRequest("http://localhost:3000/api/v1/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ priceId: "price_pro_monthly", paymentMethodId: "pm_999" }),
      headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.clientSecret).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------
  it("should return 500 when stripe subscription creation fails", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      email: "test@example.com",
      name: "Test User",
      stripeCustomerId: "cus_existing",
    });

    vi.mocked(getPlanFromPriceId).mockReturnValue("PRO");
    vi.mocked(stripe.paymentMethods.attach).mockResolvedValue({});
    vi.mocked(stripe.customers.update).mockResolvedValue({});
    vi.mocked(stripe.subscriptions.create).mockRejectedValue(
      new Error("Stripe API error: card_declined"),
    );

    const req = new NextRequest("http://localhost:3000/api/v1/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ priceId: "price_pro_monthly", paymentMethodId: "pm_bad" }),
      headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
    });
    const response = await POST(req);

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Failed to create subscription");
  });

  // -----------------------------------------------------------------------
  // Audit logger
  // -----------------------------------------------------------------------
  it("should call logAudit with correct parameters on successful subscription", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      email: "test@example.com",
      name: "Test User",
      stripeCustomerId: "cus_existing",
    });

    vi.mocked(getPlanFromPriceId).mockReturnValue("BUSINESS");
    vi.mocked(stripe.paymentMethods.attach).mockResolvedValue({});
    vi.mocked(stripe.customers.update).mockResolvedValue({});
    vi.mocked(stripe.subscriptions.create).mockResolvedValue({
      id: "sub_audit_test",
      status: "incomplete",
      latest_invoice: { payment_intent: { client_secret: "pi_secret_audit" } },
    });
    vi.mocked(prisma.user.update).mockResolvedValue({});

    const { logAudit } = await import("@/services/auditLogger");

    const req = new NextRequest("http://localhost:3000/api/v1/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ priceId: "price_business_monthly", paymentMethodId: "pm_audit" }),
      headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
    });
    await POST(req);

    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith({
      userId: "user-123",
      action: "SUBSCRIPTION_CREATED",
      resource: "Subscription",
      metadata: {
        plan: "price_business_monthly",
        subscriptionId: "sub_audit_test",
      },
    });
  });
});
