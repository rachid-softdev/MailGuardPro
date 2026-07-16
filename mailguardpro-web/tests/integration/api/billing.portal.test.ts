import { NextRequest } from "next/server";
/**
 * Integration tests for POST /api/v1/billing/portal.
 *
 * Verifies auth + CSRF gates (security P0) and the two customer paths
 * (existing customer vs. first-time customer creation).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: vi.fn(() => ({ valid: true, error: undefined })),
}));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve({ user: { id: "user-1", email: "a@b.com", name: "A" } })),
  handlers: { GET: vi.fn(), POST: vi.fn() },
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

// Controllable user record returned by prisma.user.findUnique.
// The route calls findUnique twice in the no-customer branch:
//   1) select:{stripeCustomerId}  2) select:{email,name}
let userState: { stripeCustomerId: string | null; email: string | null; name?: string } = {
  stripeCustomerId: "cus_existing",
  email: "a@b.com",
  name: "A",
};
vi.mock("@/lib/stripe", () => ({
  stripe: {
    customers: { create: vi.fn().mockResolvedValue({ id: "cus_new" }) },
    billingPortal: { sessions: { create: vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/session" }) } },
  },
  getPlanFromPriceId: vi.fn(),
  PRICES: {},
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
  loggerApi: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from "@/app/api/v1/billing/portal/route";
import { auth } from "@/lib/auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";

function req() {
  return new NextRequest("http://localhost:3000/api/v1/billing/portal", {
    method: "POST",
    headers: { origin: "http://localhost:3000" },
  });
}

describe("POST /api/v1/billing/portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userState = { stripeCustomerId: "cus_existing", email: "a@b.com", name: "A" };
    vi.mocked(validateCsrfOrigin).mockReturnValue({ valid: true, error: undefined });
    vi.mocked(prisma.user.findUnique).mockImplementation(async (args: any) => {
      const sel = args?.select ?? {};
      if (sel.email) return { email: userState.email, name: userState.name };
      return { stripeCustomerId: userState.stripeCustomerId };
    });
  });
  afterEach(() => vi.restoreAllMocks());

  // ── P0: unauthenticated ──
  it("should return 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null);
    const res = await POST(req());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Authentication required/i);
  });

  // ── P0: invalid CSRF origin ──
  it("should return 403 when CSRF origin is invalid", async () => {
    vi.mocked(validateCsrfOrigin).mockReturnValue({ valid: false, error: "Invalid origin" });
    const res = await POST(req());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid origin/);
  });

  // ── P1: existing customer → portal session ──
  it("should create a portal session for an existing Stripe customer", async () => {
    userState = { stripeCustomerId: "cus_existing", email: "a@b.com", name: "A" };
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.url).toBe("https://billing.stripe.com/session");
  });

  // ── P1: no customer + email → create customer then portal ──
  it("should create a Stripe customer then portal session when none exists", async () => {
    userState = { stripeCustomerId: null, email: "a@b.com", name: "A" };
    const { stripe } = await import("@/lib/stripe");
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://billing.stripe.com/session");
    expect(stripe.customers.create).toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stripeCustomerId: "cus_new" } }),
    );
  });

  // ── P1: no customer + no email → 400 ──
  it("should return 400 when no customer exists and user has no email", async () => {
    userState = { stripeCustomerId: null, email: null, name: "A" };
    const res = await POST(req());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/No email on file/);
  });

  // ── P2: billingPortal session creation throws → 500 ──
  it("should return 500 when Stripe portal session creation fails", async () => {
    userState = { stripeCustomerId: "cus_existing", email: "a@b.com", name: "A" };
    const { stripe } = await import("@/lib/stripe");
    vi.mocked(stripe.billingPortal.sessions.create).mockRejectedValueOnce(new Error("Stripe down"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Failed to create billing portal session/);
  });
});
