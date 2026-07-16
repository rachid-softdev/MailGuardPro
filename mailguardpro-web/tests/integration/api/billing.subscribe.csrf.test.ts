import { NextRequest } from "next/server";
/**
 * Integration tests for POST /api/v1/billing/subscribe — CSRF gate.
 *
 * The subscribe route calls validateCsrfOrigin before any other logic.
 * This was previously untested (the generic subscribe suite mocks nothing
 * for CSRF). We assert the 403 rejection path here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: vi.fn(() => ({ valid: true, error: undefined })),
}));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() =>
    Promise.resolve({ user: { id: "user-123", email: "test@example.com", name: "Test User" } }),
  ),
  handlers: { GET: vi.fn(), POST: vi.fn() },
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    customers: { create: vi.fn(), update: vi.fn() },
    paymentMethods: { attach: vi.fn() },
    subscriptions: { create: vi.fn() },
  },
  getPlanFromPriceId: vi.fn(),
  PRICES: {
    STARTER: "price_starter_monthly",
    PRO: "price_pro_monthly",
    BUSINESS: "price_business_monthly",
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) } },
}));
vi.mock("@/services/auditLogger", () => ({
  AuditAction: { SUBSCRIPTION_CREATED: "SUBSCRIPTION_CREATED" },
  AuditResource: { SUBSCRIPTION: "Subscription" },
  logAudit: vi.fn(),
}));
vi.mock("crypto", () => ({
  __esModule: true,
  default: { randomUUID: vi.fn(() => "test-uuid-12345") },
  randomUUID: vi.fn(() => "test-uuid-12345"),
}));

import { POST } from "@/app/api/v1/billing/subscribe/route";
import { auth } from "@/lib/auth";
import { validateCsrfOrigin } from "@/lib/csrf";

function req() {
  return new NextRequest("http://localhost:3000/api/v1/billing/subscribe", {
    method: "POST",
    body: JSON.stringify({ priceId: "price_pro_monthly", paymentMethodId: "pm_123" }),
    headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
  });
}

describe("POST /api/v1/billing/subscribe — CSRF gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateCsrfOrigin).mockReturnValue({ valid: true, error: undefined });
    process.env.STRIPE_STARTER_PRICE_ID = "price_starter_monthly";
    process.env.STRIPE_PRO_PRICE_ID = "price_pro_monthly";
    process.env.STRIPE_BUSINESS_PRICE_ID = "price_business_monthly";
  });
  afterEach(() => vi.restoreAllMocks());

  // ── P0: invalid CSRF origin → 403 before auth ──
  it("should return 403 and NOT authenticate when CSRF origin is invalid", async () => {
    vi.mocked(validateCsrfOrigin).mockReturnValue({ valid: false, error: "Invalid origin" });
    const res = await POST(req());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid origin/);
    // Short-circuits: auth() should not even be called
    expect(auth).not.toHaveBeenCalled();
  });

  // ── P0: valid CSRF → proceeds (smoke: reaches auth) ──
  it("should proceed past CSRF when origin is valid", async () => {
    vi.mocked(validateCsrfOrigin).mockReturnValue({ valid: true, error: undefined });
    const res = await POST(req());
    // With valid CSRF it continues; auth runs (we don't fully set up Stripe mocks here)
    expect(auth).toHaveBeenCalled();
    expect(res.status).not.toBe(403);
  });
});
