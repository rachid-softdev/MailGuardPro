import { NextRequest, NextResponse } from "next/server";
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
  validateWebhookUrlWithDns: vi.fn().mockResolvedValue({ valid: true }),
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

describe("/api/v1/webhooks", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset count mock implementation to default 0 (vi.clearAllMocks doesn't clear implementations)
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.webhook.count).mockResolvedValue(0);
  });

  describe("GET", () => {
    it("should return 401 when not authenticated", async () => {
      const { auth } = await import("@/lib/auth");
      vi.mocked(auth).mockResolvedValueOnce(null);

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
        },
        {
          id: "webhook-2",
          url: "https://example.com/hook2",
          events: ["credit_low"],
          isActive: false,
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
      vi.mocked(auth).mockResolvedValueOnce(null);

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
        createdAt: new Date().toISOString(),
        encryptedSecret: "encrypted:generated-secret",
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
      const { encryptToken } = await import("@/lib/crypto");

      vi.mocked(prisma.webhook.create).mockResolvedValue({
        id: "webhook-123",
        url: "https://example.com/hook",
        name: "My Webhook",
        events: ["bulk_job_completed"],
        isActive: true,
        userId: "user-123",
        createdAt: new Date().toISOString(),
        encryptedSecret: "encrypted:generated-secret",
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
      expect(json.error).toContain("Maximum 10 webhooks");
    });

    it("should encrypt the secret before storing in database", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { encryptToken } = await import("@/lib/crypto");

      vi.mocked(prisma.webhook.create).mockImplementation(async (args: any) => {
        // Verify that the data.encryptedSecret was used (not raw secret)
        expect(args.data.encryptedSecret).toBeDefined();
        return {
          id: "webhook-enc-test",
          ...args.data,
        };
      });

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
  });
});
