import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/v1/webhooks/route";

// Mock dependencies
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve({ user: { id: "user-123" } })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhook: {
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

vi.mock("@/lib/crypto", () => ({
  encryptToken: vi.fn((s: string) => `encrypted:${s}`),
  decryptToken: vi.fn((s: string) => s.replace("encrypted:", "")),
}));

vi.mock("@/lib/ssrf", () => ({
  validateWebhookUrlWithDns: vi.fn().mockResolvedValue({
    valid: true,
    resolvedIps: ["93.184.216.34"],
  }),
  resolveWebhookIps: vi.fn().mockResolvedValue({ valid: true, ips: ["93.184.216.34"] }),
}));

vi.mock("@/services/auditLogger", () => ({
  AuditAction: { WEBHOOK_CREATED: "webhook_created" },
  AuditResource: { WEBHOOK: "webhook" },
  logAudit: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(),
    setex: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    eval: vi.fn(),
    publish: vi.fn(),
    duplicate: vi.fn(() => ({
      subscribe: vi.fn(),
      on: vi.fn(),
      disconnect: vi.fn(),
    })),
  },
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  deleteCached: vi.fn().mockResolvedValue(undefined),
  checkRateLimit: vi.fn().mockResolvedValue({
    success: true,
    remaining: 999,
    resetAt: Date.now() + 3600000,
    limit: 100,
  }),
  publishProgress: vi.fn(),
  subscribeToProgress: vi.fn(() => vi.fn()),
  default: {},
}));

vi.mock("@/lib/rateLimits", () => ({
  checkRateLimitByPlan: vi.fn(),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  loggerApi: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    child: vi.fn(() => ({
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    })),
  },
}));

describe("/api/v1/webhooks", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset count mock implementation to default 0 (vi.clearAllMocks doesn't clear implementations)
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.webhook.count).mockResolvedValue(0);

    const { checkRateLimitByPlan } = await import("@/lib/rateLimits");
    vi.mocked(checkRateLimitByPlan).mockResolvedValue({
      success: true,
      remaining: 999,
      limit: 100,
      resetAt: Date.now() + 60000,
    });

    const { validateCsrfOrigin } = await import("@/lib/csrf");
    vi.mocked(validateCsrfOrigin).mockReturnValue({ valid: true });
  });

  describe("GET", () => {
    it("should return 401 when not authenticated", async () => {
      const { auth } = await import("@/lib/auth");
      vi.mocked(auth).mockResolvedValueOnce(null as any);

      const req = new NextRequest("http://localhost:3000/api/v1/webhooks");
      const response = await GET(req);

      expect(response.status).toBe(401);
    });

    it("should return webhooks for authenticated user", async () => {
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.webhook.findMany).mockResolvedValue([
        {
          id: "webhook-1",
          url: "https://example.com/hook1",
          events: ["bulk_job_completed"],
          isActive: true,
          userId: "user-123",
          name: null,
          createdAt: new Date(),
          encryptedSecret: "encrypted-xxx",
          privacyMode: false,
          pinnedIps: null,
        },
        {
          id: "webhook-2",
          url: "https://example.com/hook2",
          events: ["credit_low"],
          isActive: false,
          userId: "user-123",
          name: null,
          createdAt: new Date(),
          encryptedSecret: "encrypted-xxx",
          privacyMode: false,
          pinnedIps: null,
        },
      ]);

      const req = new NextRequest("http://localhost:3000/api/v1/webhooks");
      const response = await GET(req);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(2);
    });

    it("should return empty array when no webhooks", async () => {
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.webhook.findMany).mockResolvedValue([]);

      const req = new NextRequest("http://localhost:3000/api/v1/webhooks");
      const response = await GET(req);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data).toEqual([]);
    });

    it("should return 500 when prisma.findMany throws", async () => {
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.webhook.findMany).mockRejectedValueOnce(new Error("DB error"));

      const req = new NextRequest("http://localhost:3000/api/v1/webhooks");
      const response = await GET(req);

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("Internal server error");
    });
  });

  describe("POST", () => {
    /** Create a NextRequest with CSRF-safe Origin header */
    function postReq(url: string, body: any, extraHeaders?: Record<string, string>): NextRequest {
      return new NextRequest(url, {
        method: "POST",
        headers: { origin: "http://localhost:3000", ...extraHeaders },
        body: JSON.stringify(body),
      });
    }

    it("should return 401 when not authenticated", async () => {
      const { auth } = await import("@/lib/auth");
      vi.mocked(auth).mockResolvedValueOnce(null as any);

      const body = {
        url: "https://example.com/hook",
        events: ["bulk_job_completed"],
      };
      const req = postReq("http://localhost:3000/api/v1/webhooks", body);

      const response = await POST(req);

      expect(response.status).toBe(401);
    });

    it("should return 400 when url is missing", async () => {
      const body = { name: "Test Webhook", events: ["bulk_job_completed"] };
      const req = postReq("http://localhost:3000/api/v1/webhooks", body);

      const response = await POST(req);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.success).toBe(false);
    });

    it("should return 400 when url is invalid", async () => {
      const body = { url: "not-a-url", name: "Test Webhook", events: ["bulk_job_completed"] };
      const req = postReq("http://localhost:3000/api/v1/webhooks", body);

      const response = await POST(req);

      expect(response.status).toBe(400);
    });

    it("should return 400 when events array is empty", async () => {
      const body = { url: "https://example.com/hook", name: "Test Webhook", events: [] };
      const req = postReq("http://localhost:3000/api/v1/webhooks", body);

      const response = await POST(req);

      expect(response.status).toBe(400);
    });

    it("should create webhook with valid data", async () => {
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.webhook.create).mockResolvedValue({
        id: "webhook-123",
        url: "https://example.com/hook",
        name: "My Webhook",
        events: ["bulk_job_completed"],
        isActive: true,
        userId: "user-123",
        createdAt: new Date(),
        encryptedSecret: "encrypted:generated-secret",
        privacyMode: false,
        pinnedIps: null,
      });

      const body = {
        url: "https://example.com/hook",
        name: "My Webhook",
        events: ["bulk_job_completed"],
      };
      const req = postReq("http://localhost:3000/api/v1/webhooks", body);

      const response = await POST(req);

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty("id");
    });

    it("should return rawSecretPrefix (first 4 chars) in creation response", async () => {
      const { prisma } = await import("@/lib/prisma");

      vi.mocked(prisma.webhook.create).mockResolvedValue({
        id: "webhook-123",
        url: "https://example.com/hook",
        name: "My Webhook",
        events: ["bulk_job_completed"],
        isActive: true,
        userId: "user-123",
        createdAt: new Date(),
        encryptedSecret: "encrypted:generated-secret",
        privacyMode: false,
        pinnedIps: null,
      });
      const body = {
        url: "https://example.com/hook",
        name: "My Webhook",
        events: ["bulk_job_completed"],
      };
      const req = postReq("http://localhost:3000/api/v1/webhooks", body);

      const response = await POST(req);

      expect(response.status).toBe(201);
      const json = await response.json();
      // The response should include 'rawSecretPrefix' (first 4 chars of the unencrypted secret)
      expect(json.data).toHaveProperty("rawSecretPrefix");
      expect(typeof json.data.rawSecretPrefix).toBe("string");
      expect(json.data.rawSecretPrefix.length).toBe(4); // First 4 chars
    });

    it("should call SSRF validation with DNS on webhook URL", async () => {
      const { validateWebhookUrlWithDns } = await import("@/lib/ssrf");

      const body = {
        url: "https://example.com/hook",
        name: "Test Webhook",
        events: ["bulk_job_completed"],
      };
      const req = postReq("http://localhost:3000/api/v1/webhooks", body);

      await POST(req);

      expect(validateWebhookUrlWithDns).toHaveBeenCalledWith("https://example.com/hook");
    });

    it("should return 400 when SSRF validation fails", async () => {
      const { validateWebhookUrlWithDns } = await import("@/lib/ssrf");
      vi.mocked(validateWebhookUrlWithDns).mockResolvedValueOnce({
        valid: false,
        error: "Blocked private IP range",
      });

      const body = {
        url: "https://internal.example.com/hook",
        name: "Test Webhook",
        events: ["bulk_job_completed"],
      };
      const req = postReq("http://localhost:3000/api/v1/webhooks", body);

      const response = await POST(req);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain("Webhook URL rejected");
    });

    it("should return 400 when max webhooks reached", async () => {
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.webhook.count).mockResolvedValue(10);

      const body = {
        url: "https://example.com/hook",
        name: "Another Webhook",
        events: ["bulk_job_completed"],
      };
      const req = postReq("http://localhost:3000/api/v1/webhooks", body);

      const response = await POST(req);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain("Maximum 10 webhooks allowed");
    });

    it("should encrypt the secret before storing in database", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { encryptToken } = await import("@/lib/crypto");

      vi.mocked(prisma.webhook.create).mockImplementation((async (args: any) => {
        // Verify that the data.encryptedSecret was used (not raw secret)
        expect(args.data.encryptedSecret).toBeDefined();
        return {
          id: "webhook-enc-test",
          ...args.data,
        };
      }) as any);

      const body = {
        url: "https://example.com/hook",
        name: "Encryption Test",
        events: ["bulk_job_completed"],
      };
      const req = postReq("http://localhost:3000/api/v1/webhooks", body);

      await POST(req);

      // Verify encryptToken was called
      expect(encryptToken).toHaveBeenCalled();
    });

    // ===== P0 — Uncovered line tests =====

    it("should return 429 when rate limit exceeded", async () => {
      const { checkRateLimitByPlan } = await import("@/lib/rateLimits");
      vi.mocked(checkRateLimitByPlan).mockResolvedValueOnce({
        success: false,
        remaining: 0,
        limit: 5,
        resetAt: 9999999999,
      });

      const body = {
        url: "https://example.com/hook",
        name: "Rate Limit Test",
        events: ["bulk_job_completed"],
      };
      const req = postReq("http://localhost:3000/api/v1/webhooks", body);
      const response = await POST(req);

      expect(response.status).toBe(429);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Rate limit exceeded");
      expect(json.retryAfter).toBe(9999999999);
    });

    it("should return 400 when DNS resolved IPs are empty array", async () => {
      const { validateWebhookUrlWithDns } = await import("@/lib/ssrf");
      vi.mocked(validateWebhookUrlWithDns).mockResolvedValueOnce({
        valid: true,
        resolvedIps: [],
      });

      const body = {
        url: "https://example.com/hook",
        name: "DNS Empty Test",
        events: ["bulk_job_completed"],
      };
      const req = postReq("http://localhost:3000/api/v1/webhooks", body);
      const response = await POST(req);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain("no IPs resolved");
    });

    it("should return 400 when DNS resolvedIps is undefined", async () => {
      const { validateWebhookUrlWithDns } = await import("@/lib/ssrf");
      vi.mocked(validateWebhookUrlWithDns).mockResolvedValueOnce({
        valid: true,
      } as any);

      const body = {
        url: "https://example.com/hook",
        name: "DNS Undefined Test",
        events: ["bulk_job_completed"],
      };
      const req = postReq("http://localhost:3000/api/v1/webhooks", body);
      const response = await POST(req);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain("no IPs resolved");
    });

    it("should return 500 when prisma.webhook.create throws", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { loggerApi } = await import("@/lib/logger");
      vi.mocked(prisma.webhook.create).mockRejectedValueOnce(new Error("DB failure"));

      const body = {
        url: "https://example.com/hook",
        name: "DB Error Test",
        events: ["bulk_job_completed"],
      };
      const req = postReq("http://localhost:3000/api/v1/webhooks", body);
      const response = await POST(req);

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("Internal server error");
      expect(loggerApi.error).toHaveBeenCalled();
    });

    // ===== P1 — Functional correctness =====

    it("should return 403 when CSRF validation fails", async () => {
      const { validateCsrfOrigin } = await import("@/lib/csrf");
      vi.mocked(validateCsrfOrigin).mockReturnValueOnce({
        valid: false,
        error: "Origin not allowed",
      });

      const body = {
        url: "https://example.com/hook",
        name: "CSRF Test",
        events: ["bulk_job_completed"],
      };
      const req = postReq("http://localhost:3000/api/v1/webhooks", body);
      const response = await POST(req);

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("Origin not allowed");
    });

    it("should return 400 when name is empty", async () => {
      const body = {
        url: "https://example.com/hook",
        name: "",
        events: ["bulk_job_completed"],
      };
      const req = postReq("http://localhost:3000/api/v1/webhooks", body);
      const response = await POST(req);

      expect(response.status).toBe(400);
    });

    it("should return 400 when name exceeds 100 characters", async () => {
      const body = {
        url: "https://example.com/hook",
        name: "a".repeat(101),
        events: ["bulk_job_completed"],
      };
      const req = postReq("http://localhost:3000/api/v1/webhooks", body);
      const response = await POST(req);

      expect(response.status).toBe(400);
    });

    it("should return 400 when events is a string instead of array", async () => {
      const body = {
        url: "https://example.com/hook",
        name: "Events Test",
        events: "bulk_job_completed" as any,
      };
      const req = postReq("http://localhost:3000/api/v1/webhooks", body);
      const response = await POST(req);

      expect(response.status).toBe(400);
    });

    it("should return 400 when body contains invalid JSON", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/webhooks", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
        body: "not valid json {{{}}}",
      });
      const response = await POST(req);

      expect(response.status).toBe(400);
    });

    // ===== P2 — Verification/assertion gaps =====

    it("should call logAudit with correct parameters on success", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { logAudit } = await import("@/services/auditLogger");

      vi.mocked(prisma.webhook.create).mockResolvedValue({
        id: "webhook-audit-123",
        url: "https://example.com/hook",
        name: "Audit Test",
        events: ["bulk_job_completed"],
        isActive: true,
        userId: "user-123",
        createdAt: new Date("2025-01-01"),
        encryptedSecret: "encrypted:generated-secret",
        privacyMode: false,
        pinnedIps: '["93.184.216.34"]',
      });

      const body = {
        url: "https://example.com/hook",
        name: "Audit Test",
        events: ["bulk_job_completed"],
      };
      const req = postReq("http://localhost:3000/api/v1/webhooks", body);
      await POST(req);

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-123",
          action: "webhook_created",
          resource: "webhook",
          resourceId: "webhook-audit-123",
          metadata: expect.objectContaining({
            webhookName: "Audit Test",
            url: "https://example.com/hook",
            events: ["bulk_job_completed"],
          }),
        }),
      );
    });

    it("should store pinnedIps as JSON stringified resolved IPs", async () => {
      const { prisma } = await import("@/lib/prisma");

      vi.mocked(prisma.webhook.create).mockImplementation((async (args: any) => {
        expect(args.data.pinnedIps).toBe(JSON.stringify(["93.184.216.34"]));
        return {
          id: "webhook-pinned-123",
          url: args.data.url,
          name: args.data.name,
          events: args.data.events,
          isActive: true,
          userId: args.data.userId,
          createdAt: new Date(),
          encryptedSecret: args.data.encryptedSecret,
          privacyMode: false,
          pinnedIps: args.data.pinnedIps,
        };
      }) as any);

      const body = {
        url: "https://example.com/hook",
        name: "Pinned IPs Test",
        events: ["bulk_job_completed"],
      };
      const req = postReq("http://localhost:3000/api/v1/webhooks", body);
      await POST(req);
    });

    it("should include rawSecret warning in creation response", async () => {
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.webhook.create).mockResolvedValue({
        id: "webhook-warn-123",
        url: "https://example.com/hook",
        name: "Warning Test",
        events: ["bulk_job_completed"],
        isActive: true,
        userId: "user-123",
        createdAt: new Date(),
        encryptedSecret: "encrypted:generated-secret",
        privacyMode: false,
        pinnedIps: null,
      });

      const body = {
        url: "https://example.com/hook",
        name: "Warning Test",
        events: ["bulk_job_completed"],
      };
      const req = postReq("http://localhost:3000/api/v1/webhooks", body);
      const response = await POST(req);

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.warning).toBeDefined();
      expect(json.warning).toContain("rawSecret");
      expect(json.warning).toContain("only once");
    });

    it("should still return 201 when audit logger fails asynchronously", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { logAudit } = await import("@/services/auditLogger");

      vi.mocked(prisma.webhook.create).mockResolvedValue({
        id: "webhook-audit-fail-123",
        url: "https://example.com/hook",
        name: "Audit Fail Test",
        events: ["bulk_job_completed"],
        isActive: true,
        userId: "user-123",
        createdAt: new Date(),
        encryptedSecret: "encrypted:generated-secret",
        privacyMode: false,
        pinnedIps: null,
      });

      // Simulate an async failure that is self-caught (like void discarding the promise)
      vi.mocked(logAudit).mockImplementation(() =>
        Promise.reject(new Error("Audit logger unavailable")).catch(() => {
          /* silent catch — mimics void discarding the rejection */
        }),
      );

      const body = {
        url: "https://example.com/hook",
        name: "Audit Fail Test",
        events: ["bulk_job_completed"],
      };
      const req = postReq("http://localhost:3000/api/v1/webhooks", body);
      const response = await POST(req);

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.success).toBe(true);
    });
  });
});
