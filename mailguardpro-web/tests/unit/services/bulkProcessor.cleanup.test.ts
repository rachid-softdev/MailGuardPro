/**
 * Unit tests for L-04 — BulkProcessor catch handler logging.
 *
 * Verifies that the compensating rollback in processBulkUpload() logs
 * errors via logger.error when the rollback operations fail.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — override global setup to control prisma rollback behavior
// ---------------------------------------------------------------------------

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    user: {
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    bulkJob: {
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    setex: vi.fn(),
    del: vi.fn(),
    get: vi.fn(),
    duplicate: vi.fn(() => ({ connect: vi.fn() })),
    publish: vi.fn(),
    on: vi.fn(),
    quit: vi.fn(),
  },
  queueRedis: {
    setex: vi.fn(),
    del: vi.fn(),
    get: vi.fn(),
    duplicate: vi.fn(() => ({ connect: vi.fn() })),
    publish: vi.fn(),
    on: vi.fn(),
    quit: vi.fn(),
  },
  rateLimitRedis: {
    setex: vi.fn(),
    del: vi.fn(),
    get: vi.fn(),
    duplicate: vi.fn(() => ({ connect: vi.fn() })),
    publish: vi.fn(),
    on: vi.fn(),
    quit: vi.fn(),
  },
  publishProgress: vi.fn(),
  checkRateLimit: vi.fn(),
  getCached: vi.fn(),
  setCached: vi.fn(),
  deleteCached: vi.fn(),
  subscribeToProgress: vi.fn(),
}));

// Queue add must use a non-vi.fn function that always rejects to survive vi.clearAllMocks()
vi.mock("bullmq", () => ({
  Queue: function () {
    return {
      add: function () {
        return Promise.reject(new Error("Queue unavailable"));
      },
    };
  },
}));

// Mock logger — bulkProcessor uses logger.error (pino-style: logger.error(dataObj, msgStr))
const mockLoggerError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({
  logger: {
    error: mockLoggerError,
    warn: vi.fn(),
    info: vi.fn(),
    child: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() })),
  },
  loggerApi: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  loggerWebhook: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  loggerWorker: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  loggerAuth: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { processBulkUpload } from "@/services/bulkProcessor";

describe("BulkProcessor cleanup logging [L-04]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const csvContent = "email\ntest@example.com";
  const csvFile = new File([csvContent], "test.csv", { type: "text/csv" });
  const userId = "user-cleanup-test";

  it("should log error when compensating rollback refund fails", async () => {
    // DB transaction succeeds
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      return cb({
        user: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        bulkJob: {
          create: vi.fn().mockResolvedValue({ id: "job-cleanup", userId, status: "PENDING" }),
        },
      });
    });

    // Redis/Queue fails after DB commit
    vi.mocked(redis.setex).mockRejectedValue(new Error("Redis connection lost"));

    // Rollback refund fails too → caught by .catch
    vi.mocked(prisma.user.update).mockRejectedValue(new Error("DB rollback error"));

    // Job deletion should resolve (we only test refund error in this case)
    vi.mocked(prisma.bulkJob.delete).mockResolvedValue({ id: "job-cleanup" } as any);

    const result = await processBulkUpload(csvFile, userId);

    expect(result.success).toBe(false);

    // Verify logger.error was called with "Rollback refund failed" message
    const refundLogs = mockLoggerError.mock.calls.filter(
      (call) => typeof call[1] === "string" && call[1].includes("Rollback refund failed"),
    );
    expect(refundLogs.length).toBeGreaterThanOrEqual(1);
  });

  it("should log error when compensating rollback job deletion fails", async () => {
    // DB transaction succeeds
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      return cb({
        user: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        bulkJob: {
          create: vi.fn().mockResolvedValue({ id: "job-delete-fail", userId, status: "PENDING" }),
        },
      });
    });

    // Redis/Queue fails after DB commit
    vi.mocked(redis.setex).mockRejectedValue(new Error("Redis unavailable"));

    // Rollback refund succeeds
    vi.mocked(prisma.user.update).mockResolvedValue({ id: userId } as any);

    // Job deletion fails → caught by .catch
    vi.mocked(prisma.bulkJob.delete).mockRejectedValue(new Error("DB deletion failed"));

    const result = await processBulkUpload(csvFile, userId);

    expect(result.success).toBe(false);

    // Verify logger.error was called with "Compensating rollback: job deletion failed" message
    const deletionLogs = mockLoggerError.mock.calls.filter(
      (call) =>
        typeof call[1] === "string" &&
        call[1].includes("Compensating rollback: job deletion failed"),
    );
    expect(deletionLogs.length).toBeGreaterThanOrEqual(1);
  });

  it("should log both errors when both rollback operations fail", async () => {
    // DB transaction succeeds
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      return cb({
        user: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        bulkJob: {
          create: vi.fn().mockResolvedValue({ id: "job-both-fail", userId, status: "PENDING" }),
        },
      });
    });

    // Redis/Queue fails
    vi.mocked(redis.setex).mockRejectedValue(new Error("Redis down"));

    // Both rollback operations fail
    vi.mocked(prisma.user.update).mockRejectedValue(new Error("Refund DB error"));
    vi.mocked(prisma.bulkJob.delete).mockRejectedValue(new Error("Delete DB error"));

    const result = await processBulkUpload(csvFile, userId);

    expect(result.success).toBe(false);

    // Should have at least 2 logger.error calls
    const bulkLogs = mockLoggerError.mock.calls.filter(
      (call) =>
        typeof call[1] === "string" &&
        (call[1].includes("Rollback refund failed") ||
          call[1].includes("Compensating rollback: job deletion failed")),
    );
    expect(bulkLogs.length).toBeGreaterThanOrEqual(2);
  });

  it("should not break when rollback catch handlers are triggered", async () => {
    // DB transaction succeeds
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      return cb({
        user: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        bulkJob: {
          create: vi.fn().mockResolvedValue({ id: "job-no-break", userId, status: "PENDING" }),
        },
      });
    });

    // Redis/Queue fails
    vi.mocked(redis.setex).mockRejectedValue(new Error("Redis failure"));

    // Both rollback operations fail
    vi.mocked(prisma.user.update).mockRejectedValue(new Error("Refund error"));
    vi.mocked(prisma.bulkJob.delete).mockRejectedValue(new Error("Deletion error"));

    // Should not throw — the catches should handle it gracefully
    await expect(processBulkUpload(csvFile, userId)).resolves.toBeDefined();
  });
});
