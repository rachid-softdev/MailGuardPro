import { beforeEach, describe, expect, it, vi } from "vitest";

// Verifies the compensating rollback in processBulkUpload refunds credits and
// deletes the job when the DB committed but the queue submission failed.
const {
  mockPrisma,
  mockQueueAdd,
  mockUserUpdateMany,
  mockBulkJobCreate,
  mockUserUpdate,
  mockBulkJobDelete,
} = vi.hoisted(() => ({
  mockUserUpdateMany: vi.fn(),
  mockBulkJobCreate: vi.fn(),
  mockQueueAdd: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockBulkJobDelete: vi.fn(),
  mockPrisma: {
    bulkJob: {
      create: null as any,
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: null as any,
    },
    validation: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
    },
    user: {
      updateMany: null as any,
      update: null as any,
      findUnique: vi.fn(),
    },
    $transaction: null as any,
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

mockPrisma.bulkJob.create = mockBulkJobCreate;
mockPrisma.bulkJob.delete = mockBulkJobDelete;
mockPrisma.user.updateMany = mockUserUpdateMany;
mockPrisma.user.update = mockUserUpdate;
mockPrisma.$transaction = vi.fn((cb: (tx: any) => Promise<any>) =>
  cb({
    user: { updateMany: mockUserUpdateMany },
    bulkJob: { create: mockBulkJobCreate },
    validation: { create: vi.fn() },
  }),
);

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/redis", () => ({
  redis: { publish: vi.fn() },
  queueRedis: { publish: vi.fn() },
  rateLimitRedis: { publish: vi.fn() },
  publishProgress: vi.fn(),
  checkRateLimit: vi.fn(),
  getCached: vi.fn(),
  setCached: vi.fn(),
  deleteCached: vi.fn(),
  subscribeToProgress: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: vi.fn(function () {
    return { add: mockQueueAdd };
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  loggerApi: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  loggerWorker: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { processBulkUpload } from "@/services/bulkProcessor";

describe("bulkProcessor.processBulkUpload — compensating rollback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserUpdateMany.mockResolvedValue({ count: 1 });
    mockBulkJobCreate.mockResolvedValue({ id: "job-rollback", userId: "user-1" });
    mockQueueAdd.mockResolvedValue({ id: "bull-job-123" });
    mockUserUpdate.mockResolvedValue({ id: "user-1" });
    mockBulkJobDelete.mockResolvedValue({ id: "job-rollback" });
  });

  it("should refund credits (increment) when DB committed but queue submission fails", async () => {
    const csv = "email\ntest@example.com\ntwo@example.com";
    const file = new File([csv], "test.csv", { type: "text/csv" });

    // Queue add fails AFTER the DB transaction committed
    mockQueueAdd.mockRejectedValue(new Error("Redis down"));

    const result = await processBulkUpload(file, "user-1");

    expect(result.success).toBe(false);

    // Credit refund must increment by the original cost (2 emails)
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: { credits: { increment: 2 } },
      }),
    );
  });

  it("should delete the bulk job during rollback", async () => {
    const csv = "email\ntest@example.com";
    const file = new File([csv], "test.csv", { type: "text/csv" });

    mockQueueAdd.mockRejectedValue(new Error("Redis down"));

    const result = await processBulkUpload(file, "user-1");

    expect(result.success).toBe(false);
    const createdId = mockBulkJobCreate.mock.calls[0][0].data.id;
    expect(mockBulkJobDelete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: createdId } }),
    );
  });

  it("should NOT refund when the DB transaction itself failed (no commit)", async () => {
    // Simulate insufficient credits → transaction throws before dbCommitted=true
    mockUserUpdateMany.mockResolvedValue({ count: 0 });

    const csv = "email\ntest@example.com";
    const file = new File([csv], "test.csv", { type: "text/csv" });

    const result = await processBulkUpload(file, "user-1");

    expect(result.success).toBe(false);
    expect(mockUserUpdate).not.toHaveBeenCalled();
    expect(mockBulkJobDelete).not.toHaveBeenCalled();
  });
});
