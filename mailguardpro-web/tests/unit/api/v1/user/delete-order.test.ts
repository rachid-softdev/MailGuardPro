/**
 * Unit tests for app/api/v1/user/route.ts — DELETE /api/v1/user
 *
 * H-2 fix: Verifies that the Prisma transaction (GDPR deletion) runs
 * BEFORE the Stripe cancellation call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Stripe mock
vi.mock("@/lib/stripe", () => ({
  stripe: {
    subscriptions: {
      cancel: vi.fn().mockResolvedValue({}),
    },
  },
}));

// Prisma mock
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    session: { deleteMany: vi.fn() },
    account: { updateMany: vi.fn() },
    validation: { updateMany: vi.fn() },
    bulkJob: { updateMany: vi.fn() },
    apiKey: { deleteMany: vi.fn() },
    webhook: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

// Auth mock — return a valid session
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: "user-123", email: "test@example.com" },
  }),
}));

// CSRF mock — always pass
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: vi.fn().mockReturnValue({ valid: true }),
}));

// Audit logger mock
vi.mock("@/services/auditLogger", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  AuditAction: { USER_DELETED: "USER_DELETED" },
  AuditResource: { USER: "User" },
}));

import { DELETE } from "@/app/api/v1/user/route";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { NextRequest } from "next/server";

function createRequest(): NextRequest {
  return new NextRequest("https://mailguard.pro/api/v1/user", {
    method: "DELETE",
    headers: { origin: "https://mailguard.pro", "x-forwarded-for": "8.8.8.8" },
  });
}

describe("DELETE /api/v1/user (H-2 fix)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should run DB transaction BEFORE Stripe cancellation (H-2 fix)", async () => {
    // Simulate user with active Stripe subscription
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      stripeSubscriptionId: "sub_123",
      stripeCustomerId: "cus_456",
    });

    // Track call order
    const callOrder: string[] = [];

    vi.mocked(prisma.$transaction).mockImplementation(async () => {
      callOrder.push("DB_TRANSACTION");
      return [];
    });

    vi.mocked(stripe.subscriptions.cancel).mockImplementation(async () => {
      callOrder.push("STRIPE_CANCEL");
      return {} as any;
    });

    await DELETE(createRequest());

    // DB transaction must come FIRST, THEN Stripe cancel
    expect(callOrder).toEqual(["DB_TRANSACTION", "STRIPE_CANCEL"]);
  });

  it("should still delete account when Stripe cancel fails (best-effort)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      stripeSubscriptionId: "sub_123",
      stripeCustomerId: "cus_456",
    });
    vi.mocked(prisma.$transaction).mockResolvedValue([]);
    vi.mocked(stripe.subscriptions.cancel).mockRejectedValue(new Error("Stripe API error"));

    const response = await DELETE(createRequest());
    const body = await response.json();

    // Should return success despite Stripe failure
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_123");
  });

  it("should not attempt Stripe cancel when user has no subscription", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      stripeSubscriptionId: null,
      stripeCustomerId: null,
    });
    vi.mocked(prisma.$transaction).mockResolvedValue([]);

    await DELETE(createRequest());

    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it("should return 401 when not authenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null);

    const response = await DELETE(createRequest());
    expect(response.status).toBe(401);
  });

  it("should return 403 when CSRF validation fails", async () => {
    const { validateCsrfOrigin } = await import("@/lib/csrf");
    vi.mocked(validateCsrfOrigin).mockReturnValueOnce({
      valid: false,
      error: "Origin not allowed",
    });

    const response = await DELETE(createRequest());
    expect(response.status).toBe(403);
  });
});
