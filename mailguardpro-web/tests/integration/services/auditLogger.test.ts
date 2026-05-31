import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ===========================================================================
// NOTE: This test verifies that API routes call the audit logger.
// We mock each route's external deps so the handlers execute successfully,
// and then verify that the real auditLogger writes to prisma.auditLog.create.
// ===========================================================================

// ---------------------------------------------------------------------------
// Shared mocks — these apply to all tests in this file
// ---------------------------------------------------------------------------

// Mock @/lib/prisma globally for all route tests
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    apiKey: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    webhook: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

// Mock @/lib/auth — default is authenticated session
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() =>
    Promise.resolve({ user: { id: "user-123", email: "test@example.com", name: "Test User" } }),
  ),
  handlers: { GET: vi.fn(), POST: vi.fn() },
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

// Mock @/lib/stripe (used by subscribe route)
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

// Mock @/lib/crypto (used by api-keys and webhooks routes)
vi.mock("@/lib/crypto", () => ({
  hashApiKey: vi.fn((key: string) => `hashed_${key}`),
  encryptToken: vi.fn((s: string) => `encrypted:${s}`),
  decryptToken: vi.fn((s: string) => s.replace("encrypted:", "")),
}));

// Mock @/lib/ssrf (used by api-keys and webhooks routes)
vi.mock("@/lib/ssrf", () => ({
  getClientIp: vi.fn(() => "192.168.1.1"),
  validateWebhookUrlWithDns: vi.fn().mockResolvedValue({ valid: true }),
}));

// Mock rate limits (used by api-keys route)
// NOTE: We use plain vi.fn() here and re-setup mockResolvedValue in beforeEach
// because afterEach(restoreAllMocks) clears the implementation.
vi.mock("@/lib/rateLimits", () => ({
  checkRateLimitByPlan: vi.fn(),
  getPlanLimits: vi.fn(),
}));

// Mock uuid (used by api-keys route)
vi.mock("uuid", () => ({
  v4: vi.fn(() => "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
}));

// Mock crypto (used by webhook route for randomBytes and by ipHash for createHash)
// NOTE: hashIp uses `import crypto from "crypto"` so we must provide a `default` export.
const cryptoMock = {
  randomUUID: vi.fn(() => "test-uuid-12345"),
  randomBytes: vi.fn((size: number) => Buffer.alloc(size, "a")),
  createHmac: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => "abcdef0123456789abcdef0123456789"), // hex string for hashIp.substring()
  })),
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => "abcdef0123456789abcdef0123456789"), // hex string for hashIp.substring()
  })),
  timingSafeEqual: vi.fn(() => true),
};
vi.mock("crypto", () => ({ default: cryptoMock, ...cryptoMock }));

// NOTE: We do NOT mock @/services/auditLogger — the actual implementation runs,
// which calls prisma.auditLog.create (mocked above).

// ===========================================================================
// Tests
// ===========================================================================
describe("Audit logging integration from API routes", () => {
  let prisma: any;

  beforeAll(async () => {
    const prismaModule = await import("@/lib/prisma");
    prisma = prismaModule.prisma;
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    // Set Stripe env vars for subscribe route
    process.env.STRIPE_STARTER_PRICE_ID = "price_starter_monthly";
    process.env.STRIPE_PRO_PRICE_ID = "price_pro_monthly";
    process.env.STRIPE_BUSINESS_PRICE_ID = "price_business_monthly";

    // Re-setup rate limit mock (restoreAllMocks in afterEach clears implementations)
    const { checkRateLimitByPlan } = await import("@/lib/rateLimits");
    vi.mocked(checkRateLimitByPlan).mockResolvedValue({
      success: true,
      remaining: 999,
      resetAt: Date.now() + 3600000,
      limit: 10,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // API Key creation → calls logAudit via prisma.auditLog.create
  // -----------------------------------------------------------------------
  describe("POST /api/v1/api-keys", () => {
    it("should write audit log when creating an API key", async () => {
      const { POST } = await import("@/app/api/v1/api-keys/route");

      vi.mocked(prisma.apiKey.count).mockResolvedValue(0);
      vi.mocked(prisma.apiKey.create).mockResolvedValue({
        id: "key-123",
        keyHash: "hashed_test_key",
        keyPrefix: "mg_live_aaa",
        name: "Test Key",
        isActive: true,
        userId: "user-123",
        createdAt: new Date().toISOString(),
      });

      const req = new NextRequest("http://localhost:3000/api/v1/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: "Test Key" }),
        headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
      });
      const response = await POST(req);

      expect(response.status).toBe(201);

      // Verify the audit log was written via the real auditLogger → prisma
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      const callArg = prisma.auditLog.create.mock.calls[0][0];
      expect(callArg.data.userId).toBe("user-123");
      expect(callArg.data.action).toBe("API_KEY_CREATED");
      expect(callArg.data.resource).toBe("ApiKey");
      expect(callArg.data.resourceId).toBe("key-123");
      expect(callArg.data.metadata).toEqual({ keyName: "Test Key" });
      // ipAddress is hashed by hashIp via the real auditLogger → crypto mock
      expect(callArg.data.ipAddress).toMatch(/^[0-9a-f]{16}$/);
    });

    it("should still return 201 if audit logging fails (non-fatal)", async () => {
      const { POST } = await import("@/app/api/v1/api-keys/route");

      vi.mocked(prisma.apiKey.count).mockResolvedValue(0);
      vi.mocked(prisma.apiKey.create).mockResolvedValue({
        id: "key-456",
        keyHash: "hashed_test_key",
        keyPrefix: "mg_live_aaa",
        name: "Another Key",
        isActive: true,
        userId: "user-123",
        createdAt: new Date().toISOString(),
      });
      // Make audit log fail
      vi.mocked(prisma.auditLog.create).mockRejectedValueOnce(new Error("DB timeout"));

      const req = new NextRequest("http://localhost:3000/api/v1/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: "Another Key" }),
        headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
      });
      const response = await POST(req);

      // Even though audit failed, the API key creation should succeed
      expect(response.status).toBe(201);
    });
  });

  // -----------------------------------------------------------------------
  // logAuditEvent → prisma.auditLog.create (core integration chain)
  // Verified via real auditLogger code calling mocked prisma
  // -----------------------------------------------------------------------
  describe("logAudit → prisma integration", () => {
    it("should call prisma.auditLog.create with correct data for webhook audit event", async () => {
      const { logAuditEvent, AuditAction, AuditResource } = await import("@/services/auditLogger");

      await logAuditEvent({
        userId: "user-123",
        action: AuditAction.WEBHOOK_CREATED,
        resource: AuditResource.WEBHOOK,
        resourceId: "webhook-123",
        metadata: { webhookName: "Test Webhook", url: "https://example.com/hook" },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      const callArg = prisma.auditLog.create.mock.calls[0][0];
      expect(callArg.data.userId).toBe("user-123");
      expect(callArg.data.action).toBe("WEBHOOK_CREATED");
      expect(callArg.data.resource).toBe("Webhook");
      expect(callArg.data.resourceId).toBe("webhook-123");
      expect(callArg.data.metadata).toEqual({
        webhookName: "Test Webhook",
        url: "https://example.com/hook",
      });
    });

    it("should call prisma.auditLog.create with correct data for subscription audit event", async () => {
      const { logAuditEvent, AuditAction, AuditResource } = await import("@/services/auditLogger");

      await logAuditEvent({
        userId: "user-123",
        action: AuditAction.SUBSCRIPTION_CREATED,
        resource: AuditResource.SUBSCRIPTION,
        metadata: { plan: "price_pro_monthly", subscriptionId: "sub_audit_123" },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      const callArg = prisma.auditLog.create.mock.calls[0][0];
      expect(callArg.data.userId).toBe("user-123");
      expect(callArg.data.action).toBe("SUBSCRIPTION_CREATED");
      expect(callArg.data.resource).toBe("Subscription");
      expect(callArg.data.metadata).toEqual({
        plan: "price_pro_monthly",
        subscriptionId: "sub_audit_123",
      });
    });
  });

  // -----------------------------------------------------------------------
  // logAuditEvent error handling
  // -----------------------------------------------------------------------
  describe("logAuditEvent error handling", () => {
    it("should not throw when prisma.auditLog.create fails", async () => {
      // Import the real auditLogger
      const { logAuditEvent, AuditAction, AuditResource } = await import("@/services/auditLogger");

      vi.mocked(prisma.auditLog.create).mockRejectedValueOnce(new Error("DB connection lost"));

      // Should not throw
      await expect(
        logAuditEvent({
          userId: "user-123",
          action: AuditAction.USER_LOGIN,
          resource: AuditResource.USER,
        }),
      ).resolves.not.toThrow();
    });
  });
});
