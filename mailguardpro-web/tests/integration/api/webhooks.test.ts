import { GET, POST } from "@/app/api/v1/webhooks/route";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("/api/v1/webhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  describe.skip("POST", () => {
    it("should return 401 when not authenticated", async () => {
      const { auth } = await import("@/lib/auth");
      vi.mocked(auth).mockResolvedValueOnce(null);

      const body = {
        url: "https://example.com/hook",
        events: ["bulk_job_completed"],
      };
      const req = new NextRequest("http://localhost:3000/api/v1/webhooks", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const response = await POST(req);

      expect(response.status).toBe(401);
    });

    it("should return 400 when url is missing", async () => {
      const body = { events: ["bulk_job_completed"] };
      const req = new NextRequest("http://localhost:3000/api/v1/webhooks", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const response = await POST(req);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.success).toBe(false);
    });

    it("should return 400 when url is invalid", async () => {
      const body = { url: "not-a-url", events: ["bulk_job_completed"] };
      const req = new NextRequest("http://localhost:3000/api/v1/webhooks", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const response = await POST(req);

      expect(response.status).toBe(400);
    });

    it("should return 400 when events array is empty", async () => {
      const body = { url: "https://example.com/hook", events: [] };
      const req = new NextRequest("http://localhost:3000/api/v1/webhooks", {
        method: "POST",
        body: JSON.stringify(body),
      });

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
      });

      const body = {
        url: "https://example.com/hook",
        name: "My Webhook",
        events: ["bulk_job_completed"],
      };
      const req = new NextRequest("http://localhost:3000/api/v1/webhooks", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const response = await POST(req);

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty("id");
    });

    it("should generate secret automatically", async () => {
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.webhook.create).mockResolvedValue({
        id: "webhook-123",
        url: "https://example.com/hook",
        name: "My Webhook",
        events: ["bulk_job_completed"],
        secret: "generated-secret",
        userId: "user-123",
      });

      const body = {
        url: "https://example.com/hook",
        name: "My Webhook",
        events: ["bulk_job_completed"],
      };
      const req = new NextRequest("http://localhost:3000/api/v1/webhooks", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const response = await POST(req);

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.data).toHaveProperty("secret");
    });
  });
});
