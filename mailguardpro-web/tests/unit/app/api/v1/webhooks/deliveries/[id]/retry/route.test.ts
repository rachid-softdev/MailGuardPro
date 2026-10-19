import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuth,
  mockCsrf,
  mockRateLimit,
  mockLogAudit,
  mockPrisma,
  mockLoggerApi,
  mockRedeliver,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCsrf: vi.fn(() => ({ valid: true, error: undefined })),
  mockRateLimit: vi.fn(() => ({ success: true, resetAt: Date.now() + 60000 })),
  mockLogAudit: vi.fn(),
  mockPrisma: {
    webhookDelivery: {
      findFirst: vi.fn(),
    },
  },
  mockLoggerApi: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  mockRedeliver: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: mockCsrf }));
vi.mock("@/lib/rateLimits", () => ({ checkRateLimitByPlan: mockRateLimit, Plan: {} }));
vi.mock("@/services/auditLogger", () => ({
  AuditAction: { WEBHOOK_TRIGGERED: "WEBHOOK_TRIGGERED" },
  AuditResource: { WEBHOOK: "Webhook" },
  logAudit: mockLogAudit,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn() },
  loggerApi: mockLoggerApi,
  loggerWebhook: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/services/webhookDispatcher", () => ({
  WebhookDispatcher: { redeliver: mockRedeliver },
}));

import { POST } from "@/app/api/v1/webhooks/deliveries/[id]/retry/route";

const DELIVERY_ID = "delivery-1";

const WEBHOOK = {
  id: "w1",
  userId: "u1",
  name: "My endpoint",
  url: "https://example.com/hook",
  encryptedSecret: "enc:secret",
  events: ["bulk_job_completed"],
  isActive: true,
  pinnedIps: ["93.184.216.34"],
  deletedAt: null,
};

const FAILED_DELIVERY = {
  id: DELIVERY_ID,
  webhookId: "w1",
  event: "bulk_job_completed",
  url: "https://example.com/hook",
  status: "failed",
  statusCode: null,
  requestBody: {
    event: "bulk_job_completed",
    timestamp: "2026-10-01T00:00:00.000Z",
    data: { jobId: "123" },
  },
  responseBody: null,
  durationMs: null,
  error: "Connection refused",
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  webhook: WEBHOOK,
};

function req() {
  return new NextRequest(
    `https://mailguardpro.com/api/v1/webhooks/deliveries/${DELIVERY_ID}/retry`,
    { method: "POST" },
  );
}

describe("POST /api/v1/webhooks/deliveries/[id]/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "u1", plan: "PRO" } });
    mockCsrf.mockReturnValue({ valid: true, error: undefined });
    mockRateLimit.mockReturnValue({ success: true, resetAt: Date.now() + 60000 });
    mockPrisma.webhookDelivery.findFirst.mockResolvedValue(FAILED_DELIVERY);
    mockRedeliver.mockResolvedValue(true);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(req(), { params: Promise.resolve({ id: DELIVERY_ID }) });
    expect(res.status).toBe(401);
    expect(mockRedeliver).not.toHaveBeenCalled();
  });

  it("returns 403 when CSRF origin is invalid", async () => {
    mockCsrf.mockReturnValue({ valid: false, error: "CSRF" });
    const res = await POST(req(), { params: Promise.resolve({ id: DELIVERY_ID }) });
    expect(res.status).toBe(403);
    expect(mockRedeliver).not.toHaveBeenCalled();
  });

  it("returns 429 when the webhooks rate limit is exceeded", async () => {
    mockRateLimit.mockReturnValue({ success: false, resetAt: Date.now() + 1000 });
    const res = await POST(req(), { params: Promise.resolve({ id: DELIVERY_ID }) });
    expect(res.status).toBe(429);
    expect(mockRedeliver).not.toHaveBeenCalled();
    expect(mockRateLimit).toHaveBeenCalledWith("u1", "PRO", "webhooks");
  });

  it("returns 404 for a delivery that does not belong to the user (IDOR guard)", async () => {
    mockPrisma.webhookDelivery.findFirst.mockResolvedValue(null);
    const res = await POST(req(), { params: Promise.resolve({ id: DELIVERY_ID }) });
    expect(res.status).toBe(404);
    expect(mockRedeliver).not.toHaveBeenCalled();
    expect(mockPrisma.webhookDelivery.findFirst).toHaveBeenCalledWith({
      where: { id: DELIVERY_ID, webhook: { userId: "u1", deletedAt: null } },
      include: { webhook: true },
    });
  });

  it("returns 400 when the delivery is not failed", async () => {
    mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
      ...FAILED_DELIVERY,
      status: "success",
    });
    const res = await POST(req(), { params: Promise.resolve({ id: DELIVERY_ID }) });
    expect(res.status).toBe(400);
    expect(mockRedeliver).not.toHaveBeenCalled();
  });

  it("returns 409 when the webhook is disabled", async () => {
    mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
      ...FAILED_DELIVERY,
      webhook: { ...WEBHOOK, isActive: false },
    });
    const res = await POST(req(), { params: Promise.resolve({ id: DELIVERY_ID }) });
    expect(res.status).toBe(409);
    expect(mockRedeliver).not.toHaveBeenCalled();
  });

  it("returns 409 when the webhook no longer subscribes to the event", async () => {
    mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
      ...FAILED_DELIVERY,
      webhook: { ...WEBHOOK, events: ["other_event"] },
    });
    const res = await POST(req(), { params: Promise.resolve({ id: DELIVERY_ID }) });
    expect(res.status).toBe(409);
    expect(mockRedeliver).not.toHaveBeenCalled();
  });

  it("redelivers with the stored payload data and audits the success", async () => {
    const res = await POST(req(), { params: Promise.resolve({ id: DELIVERY_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      redeliveryOf: DELIVERY_ID,
      event: "bulk_job_completed",
      url: WEBHOOK.url,
    });

    expect(mockRedeliver).toHaveBeenCalledWith(WEBHOOK, "bulk_job_completed", { jobId: "123" });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        action: "WEBHOOK_TRIGGERED",
        resource: "Webhook",
        resourceId: "w1",
        metadata: expect.objectContaining({
          redeliveryOf: DELIVERY_ID,
          event: "bulk_job_completed",
          outcome: "success",
        }),
      }),
    );
  });

  it("returns 502 when the redelivery attempt fails and audits the failure", async () => {
    mockRedeliver.mockResolvedValue(false);
    const res = await POST(req(), { params: Promise.resolve({ id: DELIVERY_ID }) });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          redeliveryOf: DELIVERY_ID,
          outcome: "failed",
        }),
      }),
    );
  });

  it("falls back to an empty data object when the stored payload is malformed", async () => {
    mockPrisma.webhookDelivery.findFirst.mockResolvedValue({
      ...FAILED_DELIVERY,
      requestBody: null,
    });
    const res = await POST(req(), { params: Promise.resolve({ id: DELIVERY_ID }) });
    expect(res.status).toBe(200);
    expect(mockRedeliver).toHaveBeenCalledWith(WEBHOOK, "bulk_job_completed", {});
  });

  it("returns 500 on unexpected error", async () => {
    mockPrisma.webhookDelivery.findFirst.mockRejectedValue(new Error("db down"));
    const res = await POST(req(), { params: Promise.resolve({ id: DELIVERY_ID }) });
    expect(res.status).toBe(500);
  });
});
