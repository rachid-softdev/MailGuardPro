import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks - must be defined before vi.mock calls
const { mockPrisma, mockFetch, mockLoggerWebhook } = vi.hoisted(() => {
  const prismaMock = {
    webhookDelivery: {
      create: vi.fn().mockResolvedValue({ id: "delivery-1" }),
    },
    webhook: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };

  const fetchMock = vi.fn();
  const loggerMock = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return {
    mockPrisma: prismaMock,
    mockFetch: fetchMock,
    mockLoggerWebhook: loggerMock,
  };
});

// Setup global fetch mock
global.fetch = mockFetch;

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn() },
  loggerApi: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  loggerWebhook: mockLoggerWebhook,
  loggerWorker: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  loggerAuth: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/ssrf", () => ({
  resolveWebhookIps: vi.fn().mockResolvedValue({ valid: true, ips: ["93.184.216.34"] }),
}));

vi.mock("@/lib/crypto", () => ({
  decryptToken: vi.fn((s: string) => s),
}));

import { WebhookDispatcher } from "@/services/webhookDispatcher";

describe("webhookDispatcher - persistDelivery", () => {
  const TEST_WEBHOOK = {
    id: "webhook-123",
    url: "https://example.com/webhook",
    secret: "test-secret",
    encryptedSecret: "test-secret",
    events: ["bulk_job_completed"],
    isActive: true,
    pinnedIps: ["93.184.216.34"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockPrisma.webhookDelivery.create.mockResolvedValue({ id: "delivery-1" });
  });

  // ──────────────── Successful delivery ────────────────

  it("should create a delivery record with status 'success' on successful dispatch", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: "OK" } as any);

    await WebhookDispatcher.dispatch(TEST_WEBHOOK, "bulk_job_completed", {
      jobId: "123",
    });

    expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          webhookId: "webhook-123",
          status: "success",
          statusCode: 200,
        }),
      }),
    );
  });

  it("should include the webhook URL in the delivery record", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: "OK" } as any);

    await WebhookDispatcher.dispatch(TEST_WEBHOOK, "bulk_job_completed", { test: "data" });

    expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          url: "https://example.com/webhook",
        }),
      }),
    );
  });

  it("should include the event name in the delivery record", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: "OK" } as any);

    await WebhookDispatcher.dispatch(TEST_WEBHOOK, "bulk_job_completed", { test: "data" });

    expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: "bulk_job_completed",
        }),
      }),
    );
  });

  it("should include the request body in the delivery record on success", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: "OK" } as any);
    const payload = { jobId: "123", total: 100 };

    await WebhookDispatcher.dispatch(TEST_WEBHOOK, "bulk_job_completed", payload);

    expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestBody: expect.objectContaining({
            data: payload,
            event: "bulk_job_completed",
          }),
        }),
      }),
    );
  });

  // ──────────────── Failed delivery ────────────────

  it("should create a delivery record with status 'failed' after all retries exhausted", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    await WebhookDispatcher.dispatch(TEST_WEBHOOK, "bulk_job_completed", { test: "data" });

    expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          webhookId: "webhook-123",
          status: "failed",
        }),
      }),
    );
  }, 20000);

  it("should include error message in failed delivery record", async () => {
    mockFetch.mockRejectedValue(new Error("Connection refused"));

    await WebhookDispatcher.dispatch(TEST_WEBHOOK, "bulk_job_completed", { test: "data" });

    expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          error: "Connection refused",
        }),
      }),
    );
  }, 20000);

  it("should include request body in failed delivery record", async () => {
    mockFetch.mockRejectedValue(new Error("Timeout"));
    const payload = { jobId: "fail-123" };

    await WebhookDispatcher.dispatch(TEST_WEBHOOK, "bulk_job_completed", payload);

    expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestBody: expect.objectContaining({
            data: payload,
          }),
        }),
      }),
    );
  }, 20000);

  // Not called cases

  it("should NOT create delivery record when webhook is inactive", async () => {
    await WebhookDispatcher.dispatch({ ...TEST_WEBHOOK, isActive: false }, "bulk_job_completed", {
      test: "data",
    });

    expect(mockPrisma.webhookDelivery.create).not.toHaveBeenCalled();
  });

  it("should NOT create delivery record when event is not in webhook events list", async () => {
    await WebhookDispatcher.dispatch(
      { ...TEST_WEBHOOK, events: ["other_event"] },
      "bulk_job_completed",
      { test: "data" },
    );

    expect(mockPrisma.webhookDelivery.create).not.toHaveBeenCalled();
  });

  it("should NOT create delivery record when DNS rebinding detected", async () => {
    // Mock DNS resolution to return different IPs than pinned
    const { resolveWebhookIps } = await import("@/lib/ssrf");
    vi.mocked(resolveWebhookIps).mockResolvedValue({
      valid: true,
      ips: ["203.0.113.1"], // Different from pinned "93.184.216.34"
    });

    // Must be in production for the DNS rebinding check to block
    vi.stubEnv("NODE_ENV", "production");

    await WebhookDispatcher.dispatch(TEST_WEBHOOK, "bulk_job_completed", { test: "data" });

    expect(mockPrisma.webhookDelivery.create).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
  });

  // ──────────────── Error handling in persistDelivery ────────────────

  it("should not throw when prisma.webhookDelivery.create fails", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: "OK" } as any);
    mockPrisma.webhookDelivery.create.mockRejectedValue(new Error("DB write failed"));

    // Should not throw despite DB error
    const result = await WebhookDispatcher.dispatch(TEST_WEBHOOK, "bulk_job_completed", {
      test: "data",
    });

    // The dispatch itself should still succeed
    expect(result).toBe(true);
    expect(mockLoggerWebhook.error).toHaveBeenCalled();
  });

  it("should log error when prisma.webhookDelivery.create fails", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: "OK" } as any);
    mockPrisma.webhookDelivery.create.mockRejectedValue(new Error("DB write failed"));

    await WebhookDispatcher.dispatch(TEST_WEBHOOK, "bulk_job_completed", { test: "data" });

    expect(mockLoggerWebhook.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining("persist delivery"),
    );
  });

  // ──────────────── Non-ok response ────────────────

  it("should create failed delivery when webhook returns 500", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as any);

    await WebhookDispatcher.dispatch(TEST_WEBHOOK, "bulk_job_completed", { test: "data" });

    // After 3 retries, should record as failed
    expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
        }),
      }),
    );
  }, 20000);
});
