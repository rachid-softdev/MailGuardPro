import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks for processBulkUpload: prisma (transaction + queue) and bullmq Queue.
const { mockPrisma, mockQueueAdd, mockUserUpdateMany, mockBulkJobCreate } = vi.hoisted(() => ({
  mockUserUpdateMany: vi.fn(),
  mockBulkJobCreate: vi.fn(),
  mockQueueAdd: vi.fn(),
  mockPrisma: {
    bulkJob: {
      create: null as any,
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: null as any,
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

// Wire the hoisted fns into the prisma mock object.
mockPrisma.bulkJob.create = mockBulkJobCreate;
mockPrisma.user.updateMany = mockUserUpdateMany;
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
    return { add: mockQueueAdd.mockResolvedValue({ id: "bull-job-123" }) };
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  loggerApi: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  loggerWorker: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { processBulkUpload } from "@/services/bulkProcessor";

describe("bulkProcessor.processBulkUpload — dedup, credits, edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserUpdateMany.mockResolvedValue({ count: 1 });
    mockBulkJobCreate.mockResolvedValue({ id: "job-dedup", userId: "user-1" });
  });

  // ── P0: duplicate email dedup + "not charged" ──────────────────────────
  it("should deduplicate case-insensitive duplicate emails and not charge for them", async () => {
    const csv = "email\na@x.com\nA@X.com\na@x.com";
    const file = new File([csv], "test.csv", { type: "text/csv" });

    const result = await processBulkUpload(file, "user-1");

    expect(result.success).toBe(true);
    expect(result.totalEmails).toBe(1);

    const callArg = mockBulkJobCreate.mock.calls[0][0];
    expect(Array.isArray(callArg.data.emailsJson)).toBe(true);
    expect(callArg.data.emailsJson).toHaveLength(1);
    expect(callArg.data.emailsJson[0].email).toBe("a@x.com");

    // credit cost charged only for the unique email (duplicates not charged)
    expect(mockUserUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { credits: { decrement: 1 } } }),
    );
  });

  it("should keep distinct emails and only charge for unique ones", async () => {
    const csv = "email\nalice@x.com\nalice@x.com\nbob@x.com\ncarol@x.com\ncarol@x.com";
    const file = new File([csv], "test.csv", { type: "text/csv" });

    const result = await processBulkUpload(file, "user-1");

    expect(result.success).toBe(true);
    expect(result.totalEmails).toBe(3);
    expect(mockUserUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { credits: { decrement: 3 } } }),
    );
  });

  // ── P0: insufficient credits ───────────────────────────────────────────
  it("should return an insufficient-credits error when user lacks credits", async () => {
    mockUserUpdateMany.mockResolvedValue({ count: 0 });

    const csv = "email\ntest@example.com";
    const file = new File([csv], "test.csv", { type: "text/csv" });

    const result = await processBulkUpload(file, "user-1");

    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toMatch(/Insufficient credits\. Required: 1/);
    // No job should be created when credits are insufficient
    expect(mockBulkJobCreate).not.toHaveBeenCalled();
  });

  // ── P1: file read failure ──────────────────────────────────────────────
  it("should return 'Failed to read file' when file.text() rejects", async () => {
    const file = new File([""], "test.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", {
      value: () => Promise.reject(new Error("disk error")),
    });

    const result = await processBulkUpload(file, "user-1");

    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toMatch(/Failed to read file/);
  });

  // ── P2: MAX_BULK_ROWS boundary ─────────────────────────────────────────
  it("should accept exactly MAX_BULK_ROWS (100000) emails", async () => {
    const rows = ["email"];
    for (let i = 0; i < 100000; i++) rows.push(`u${i}@example.com`);
    const file = new File([rows.join("\n")], "test.csv", { type: "text/csv" });

    const result = await processBulkUpload(file, "user-1");

    expect(result.success).toBe(true);
    expect(result.totalEmails).toBe(100000);
  });

  it("should reject when exceeding MAX_BULK_ROWS (100001) emails", async () => {
    const rows = ["email"];
    for (let i = 0; i < 100001; i++) rows.push(`u${i}@example.com`);
    const file = new File([rows.join("\n")], "test.csv", { type: "text/csv" });

    const result = await processBulkUpload(file, "user-1");

    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toMatch(/Too many emails/);
  });

  // ── P2: requestId propagated to the queue ──────────────────────────────
  it("should propagate requestId into the queued job data", async () => {
    const csv = "email\ntest@example.com";
    const file = new File([csv], "test.csv", { type: "text/csv" });

    await processBulkUpload(file, "user-1", undefined, { requestId: "req-xyz-789" });

    expect(mockQueueAdd).toHaveBeenCalledWith(
      "process",
      expect.objectContaining({ requestId: "req-xyz-789" }),
    );
  });

  it("should generate a requestId when none is supplied", async () => {
    const csv = "email\ntest@example.com";
    const file = new File([csv], "test.csv", { type: "text/csv" });

    await processBulkUpload(file, "user-1");

    expect(mockQueueAdd).toHaveBeenCalledWith(
      "process",
      expect.objectContaining({ requestId: expect.any(String) }),
    );
  });
});
