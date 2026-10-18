import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks
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
    },
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
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

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: vi.fn(() => ({ valid: true })),
}));

vi.mock("@/lib/logger", () => ({
  loggerApi: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------
import { POST } from "@/app/api/v1/billing/checkout/route";

const FREE_USER = {
  email: "test@example.com",
  name: "Test User",
  plan: "FREE",
  stripeCustomerId: "cus_existing",
};

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/v1/billing/checkout", {
    method: "POST",
    headers: { origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/billing/checkout", () => {
  let prisma: any;
  let stripe: any;
  let auth: any;
  let validateCsrfOrigin: any;

  beforeAll(async () => {
    const prismaModule = await import("@/lib/prisma");
    prisma = prismaModule.prisma;
    const stripeModule = await import("@/lib/stripe");
    stripe = stripeModule.stripe;
    const authModule = await import("@/lib/auth");
    auth = authModule.auth;
    const csrfModule = await import("@/lib/csrf");
    validateCsrfOrigin = csrfModule.validateCsrfOrigin;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_STARTER_PRICE_ID = "price_starter_monthly";
    process.env.STRIPE_PRO_PRICE_ID = "price_pro_monthly";
    process.env.STRIPE_BUSINESS_PRICE_ID = "price_business_monthly";
    process.env.STRIPE_STARTER_ANNUAL_PRICE_ID = "price_starter_annual";
    process.env.STRIPE_PRO_ANNUAL_PRICE_ID = "price_pro_annual";
    process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID = "price_business_annual";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.mailguardpro.com";

    vi.mocked(validateCsrfOrigin).mockReturnValue({ valid: true } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...FREE_USER });
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Auth / CSRF / validation
  // -----------------------------------------------------------------------

  it("should return 403 when CSRF validation fails", async () => {
    vi.mocked(validateCsrfOrigin).mockReturnValue({ valid: false, error: "bad origin" } as any);

    const response = await POST(postReq({ plan: "PRO" }));

    expect(response.status).toBe(403);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("should return 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as any);

    const response = await POST(postReq({ plan: "PRO" }));

    expect(response.status).toBe(401);
  });

  it("should return 400 for an invalid plan", async () => {
    const response = await POST(postReq({ plan: "FREE" }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("should return 400 when plan is missing", async () => {
    const response = await POST(postReq({}));

    expect(response.status).toBe(400);
  });

  it("should return 400 when the user already has a paid plan (no double billing)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...FREE_USER, plan: "PRO" });

    const response = await POST(postReq({ plan: "BUSINESS" }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("already have an active plan");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("should return 500 when Stripe price IDs are not configured", async () => {
    delete process.env.STRIPE_PRO_PRICE_ID;

    const response = await POST(postReq({ plan: "PRO" }));

    expect(response.status).toBe(500);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------

  it("should create a checkout session for the right price (with 14-day trial) and return its URL", async () => {
    const response = await POST(postReq({ plan: "PRO" }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.url).toBe("https://checkout.stripe.com/c/pay/cs_test_123");

    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_existing",
        client_reference_id: "user-123",
        metadata: { userId: "user-123", plan: "PRO" },
        line_items: [{ price: "price_pro_monthly", quantity: 1 }],
        subscription_data: { trial_period_days: 14 },
        success_url: "https://app.mailguardpro.com/billing?checkout=success",
        cancel_url: "https://app.mailguardpro.com/billing?checkout=cancelled",
      }),
    );
  });

  it("should use the annual price when interval=year", async () => {
    const response = await POST(postReq({ plan: "PRO", interval: "year" }));

    expect(response.status).toBe(200);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: "price_pro_annual", quantity: 1 }],
        subscription_data: { trial_period_days: 14 },
      }),
    );
  });

  it("should return 400 when annual billing is not configured for the plan", async () => {
    delete process.env.STRIPE_PRO_ANNUAL_PRICE_ID;

    const response = await POST(postReq({ plan: "PRO", interval: "year" }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("Annual billing is not available");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("should return 400 for an invalid billing interval", async () => {
    const response = await POST(postReq({ plan: "PRO", interval: "week" }));

    expect(response.status).toBe(400);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("should create a Stripe customer when the user has none and persist it", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...FREE_USER,
      stripeCustomerId: null,
    });
    vi.mocked(stripe.customers.create).mockResolvedValue({ id: "cus_new" });

    const response = await POST(postReq({ plan: "STARTER" }));

    expect(response.status).toBe(200);
    expect(stripe.customers.create).toHaveBeenCalledWith({
      email: "test@example.com",
      name: "Test User",
      metadata: { userId: "user-123" },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-123" },
      data: { stripeCustomerId: "cus_new" },
    });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_new",
        line_items: [{ price: "price_starter_monthly", quantity: 1 }],
      }),
    );
  });

  it("should return 400 when no customer exists and the user has no email", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...FREE_USER,
      email: null,
      stripeCustomerId: null,
    });

    const response = await POST(postReq({ plan: "PRO" }));

    expect(response.status).toBe(400);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("should return 500 when Stripe checkout creation throws", async () => {
    vi.mocked(stripe.checkout.sessions.create).mockRejectedValue(new Error("stripe down"));

    const response = await POST(postReq({ plan: "PRO" }));

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.success).toBe(false);
  });
});
