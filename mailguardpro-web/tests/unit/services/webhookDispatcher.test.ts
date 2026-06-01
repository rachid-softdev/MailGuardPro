import { beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted for proper hoisting
const { mockPrisma, mockFetch, mockLoggerWebhookWarn, mockLoggerWebhookError } = vi.hoisted(() => ({
  mockPrisma: {
    webhook: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
  mockFetch: vi.fn(),
  mockLoggerWebhookWarn: vi.fn(),
  mockLoggerWebhookError: vi.fn(),
}));

// Setup global fetch mock
global.fetch = mockFetch;

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn() },
  loggerApi: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  loggerWebhook: { error: mockLoggerWebhookError, warn: mockLoggerWebhookWarn, info: vi.fn() },
  loggerWorker: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  loggerAuth: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/ssrf", () => ({
  resolveWebhookIps: vi.fn().mockResolvedValue({ valid: true, ips: ["93.184.216.34"] }),
}));

vi.mock("@/lib/crypto", () => ({
  decryptToken: vi.fn((s: string) => s),
}));

import {
  createBulkJobCompletedPayload,
  WEBHOOK_EVENTS,
  WebhookDispatcher,
} from "@/services/webhookDispatcher";

describe("webhookDispatcher", () => {
  const mockWebhook = {
    id: "webhook-123",
    url: "https://example.com/webhook",
    secret: "test-secret",
    encryptedSecret: "test-secret",
    events: ["bulk_job_completed"],
    isActive: true,
    pinnedIps: '["93.184.216.34"]',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe("dispatch", () => {
    it("should return false when webhook is inactive", async () => {
      const result = await WebhookDispatcher.dispatch(
        { ...mockWebhook, isActive: false },
        "bulk_job_completed",
        { test: "data" },
      );

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should return false when event is not in webhook events", async () => {
      const result = await WebhookDispatcher.dispatch(
        { ...mockWebhook, events: ["other_event"] },
        "bulk_job_completed",
        { test: "data" },
      );

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should return true on successful dispatch", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      } as any);

      const result = await WebhookDispatcher.dispatch(mockWebhook, "bulk_job_completed", {
        jobId: "123",
        total: 100,
      });

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should include proper headers in request", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      } as any);

      await WebhookDispatcher.dispatch(mockWebhook, "bulk_job_completed", {
        jobId: "123",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/webhook",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "X-MailGuard-Event": "bulk_job_completed",
          }),
        }),
      );
    });

    it("should retry on failure and eventually succeed", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
        } as any);

      const result = await WebhookDispatcher.dispatch(mockWebhook, "bulk_job_completed", {
        test: "data",
      });

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    }, 20000);

    it("should return false after all retries exhausted", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const result = await WebhookDispatcher.dispatch(mockWebhook, "bulk_job_completed", {
        test: "data",
      });

      expect(result).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(3); // MAX_RETRIES = 3
    }, 20000);

    it("should log warning for non-ok responses", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as any);

      const result = await WebhookDispatcher.dispatch(mockWebhook, "bulk_job_completed", {
        test: "data",
      });

      expect(result).toBe(false);
      // The function logs via loggerWebhook.warn or loggerWebhook.error
      const hasWarnOrError =
        mockLoggerWebhookWarn.mock.calls.some(
          (c: any) => typeof c[1] === "string" && c[1].includes("non-ok status"),
        ) ||
        mockLoggerWebhookError.mock.calls.some(
          (c: any) => typeof c[1] === "string" && c[1].includes("failed"),
        );
      expect(hasWarnOrError).toBe(true);
    }, 20000);
  });

  describe("dispatchToUser", () => {
    it("should fetch active webhooks for user", async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([]);

      await WebhookDispatcher.dispatchToUser("user-123", "bulk_job_completed", {
        test: "data",
      });

      expect(mockPrisma.webhook.findMany).toHaveBeenCalledWith({
        where: {
          userId: "user-123",
          isActive: true,
          events: { has: "bulk_job_completed" },
        },
      });
    });

    it("should dispatch to all matching webhooks", async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([
        { ...mockWebhook, id: "webhook-1", userId: "user-123" },
        { ...mockWebhook, id: "webhook-2", userId: "user-123" },
      ]);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      } as any);

      const result = await WebhookDispatcher.dispatchToUser("user-123", "bulk_job_completed", {
        test: "data",
      });

      expect(result.total).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
    });

    it("should handle partial failures", async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([
        { ...mockWebhook, id: "webhook-1", userId: "user-123" },
        { ...mockWebhook, id: "webhook-2", userId: "user-123" },
      ]);

      // Mock fetch to return success, failure
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: "OK",
          } as any);
        }
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Error",
        } as any);
      });

      const result = await WebhookDispatcher.dispatchToUser("user-123", "bulk_job_completed", {
        test: "data",
      });

      expect(result.total).toBe(2);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
    }, 15_000);

    it("should return zero counts when no webhooks exist", async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([]);

      const result = await WebhookDispatcher.dispatchToUser("user-123", "bulk_job_completed", {
        test: "data",
      });

      expect(result.total).toBe(0);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe("verifyIncomingSignature", () => {
    it("should return true for valid signature", () => {
      const payload = '{"test":"data"}';
      const secret = "secret";
      // Compute the expected HMAC-SHA256 using Node's crypto
      const nodeCrypto = require("crypto");
      const expectedSig = nodeCrypto.createHmac("sha256", secret).update(payload).digest("hex");

      const result = WebhookDispatcher.verifyIncomingSignature(payload, expectedSig, secret);

      expect(result).toBe(true);
    });
  });

  describe("WEBHOOK_EVENTS", () => {
    it("should have all required events defined", () => {
      expect(WEBHOOK_EVENTS.BULK_JOB_COMPLETED).toBe("bulk_job_completed");
      expect(WEBHOOK_EVENTS.BULK_JOB_FAILED).toBe("bulk_job_failed");
      expect(WEBHOOK_EVENTS.DAILY_REPORT).toBe("daily_report");
      expect(WEBHOOK_EVENTS.CREDIT_LOW).toBe("credit_low");
      expect(WEBHOOK_EVENTS.PLAN_UPGRADED).toBe("plan_upgraded");
      expect(WEBHOOK_EVENTS.PLAN_EXPIRED).toBe("plan_expired");
    });
  });

  describe("createBulkJobCompletedPayload", () => {
    it("should create payload with correct structure", () => {
      const payload = createBulkJobCompletedPayload("job-123", 100, {
        valid: 80,
        invalid: 15,
        risky: 5,
      });

      expect(payload.jobId).toBe("job-123");
      expect(payload.totalEmails).toBe(100);
      expect(payload.results.valid).toBe(80);
      expect(payload.results.invalid).toBe(15);
      expect(payload.results.risky).toBe(5);
      expect(payload.deliveredRate).toBe(80);
      expect(payload.timestamp).toBeDefined();
    });

    it("should calculate delivered rate correctly", () => {
      const payload = createBulkJobCompletedPayload("job-123", 50, {
        valid: 25,
        invalid: 15,
        risky: 10,
      });

      expect(payload.deliveredRate).toBe(50);
    });
  });
});
