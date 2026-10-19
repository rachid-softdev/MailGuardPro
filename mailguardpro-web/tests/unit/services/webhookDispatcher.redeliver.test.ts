import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks - must be defined before vi.mock calls
const { mockPrisma, mockFetch, mockResolveWebhookIps } = vi.hoisted(() => {
  const prismaMock = {
    webhookDelivery: {
      create: vi.fn().mockResolvedValue({ id: "delivery-1" }),
    },
    webhook: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };

  return {
    mockPrisma: prismaMock,
    mockFetch: vi.fn(),
    mockResolveWebhookIps: vi.fn(),
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
  loggerWebhook: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  loggerWorker: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  loggerAuth: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/ssrf", () => ({
  resolveWebhookIps: mockResolveWebhookIps,
}));

vi.mock("@/lib/crypto", () => ({
  decryptToken: vi.fn((s: string) => s),
}));

import { WebhookDispatcher } from "@/services/webhookDispatcher";

const WEBHOOK_RECORD = {
  id: "webhook-123",
  url: "https://example.com/webhook",
  encryptedSecret: "test-secret",
  events: ["bulk_job_completed"],
  isActive: true,
  pinnedIps: ["93.184.216.34"],
};

describe("webhookDispatcher - redeliver (manual retry)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockResolveWebhookIps.mockResolvedValue({ valid: true, ips: ["93.184.216.34"] });
    mockPrisma.webhookDelivery.create.mockResolvedValue({ id: "delivery-1" });
  });

  it("returns true and persists a success record on a successful redelivery", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: "OK" } as any);

    const result = await WebhookDispatcher.redeliver(WEBHOOK_RECORD, "bulk_job_completed", {
      jobId: "123",
    });

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          webhookId: "webhook-123",
          status: "success",
          statusCode: 200,
          requestBody: expect.objectContaining({
            event: "bulk_job_completed",
            data: { jobId: "123" },
          }),
        }),
      }),
    );
  });

  it("makes exactly one attempt (no backoff retries) and persists a failed record", async () => {
    mockFetch.mockRejectedValue(new Error("Connection refused"));

    const result = await WebhookDispatcher.redeliver(WEBHOOK_RECORD, "bulk_job_completed", {
      jobId: "123",
    });

    expect(result).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
          error: "Connection refused",
        }),
      }),
    );
  });

  it("records the failure when the endpoint answers with a non-ok status", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as any);

    const result = await WebhookDispatcher.redeliver(WEBHOOK_RECORD, "bulk_job_completed", {});

    expect(result).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
  });

  it("accepts legacy pinnedIps stored as a JSON string", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: "OK" } as any);

    const result = await WebhookDispatcher.redeliver(
      { ...WEBHOOK_RECORD, pinnedIps: '["93.184.216.34"]' },
      "bulk_job_completed",
      {},
    );

    expect(result).toBe(true);
  });

  it("returns false without sending when the webhook is inactive", async () => {
    const result = await WebhookDispatcher.redeliver(
      { ...WEBHOOK_RECORD, isActive: false },
      "bulk_job_completed",
      {},
    );

    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns false without sending when the event is no longer subscribed", async () => {
    const result = await WebhookDispatcher.redeliver(
      { ...WEBHOOK_RECORD, events: ["other_event"] },
      "bulk_job_completed",
      {},
    );

    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns false without sending when pinned IPs are missing", async () => {
    const result = await WebhookDispatcher.redeliver(
      { ...WEBHOOK_RECORD, pinnedIps: null },
      "bulk_job_completed",
      {},
    );

    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns false without sending when DNS resolution fails", async () => {
    mockResolveWebhookIps.mockResolvedValue({ valid: false });

    const result = await WebhookDispatcher.redeliver(WEBHOOK_RECORD, "bulk_job_completed", {});

    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
