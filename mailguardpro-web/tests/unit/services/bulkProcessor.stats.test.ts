import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    bulkJob: { findFirst: vi.fn() },
    validation: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

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
    return { add: vi.fn() };
  }),
}));

import { getBulkJobStats } from "@/services/bulkProcessor";

describe("bulkProcessor.getBulkJobStats — distribution completeness & failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.bulkJob.findFirst.mockResolvedValue({
      id: "job-1",
      userId: "user-1",
      status: "COMPLETED",
      totalEmails: 100,
      processed: 100,
    });
  });

  // Item 31: missing score-distribution ranges must default to 0 (not undefined)
  it("should default all score-distribution ranges to 0 when the raw query returns only some", async () => {
    mockPrisma.validation.groupBy.mockResolvedValue([
      { status: "valid", _count: { status: 60 } },
      { status: "invalid", _count: { status: 40 } },
    ]);
    mockPrisma.validation.aggregate.mockResolvedValue({
      _avg: { score: 70 },
      _count: { score: 100 },
    });
    // Raw query only returns two of the five ranges
    mockPrisma.$queryRaw.mockResolvedValue([
      { range: "0-20", count: BigInt(5) },
      { range: "61-80", count: BigInt(20) },
    ]);

    const result = await getBulkJobStats("job-1", "user-1");

    expect(result.scoreDistribution).toEqual({
      "0-20": 5,
      "21-40": 0,
      "41-60": 0,
      "61-80": 20,
      "81-100": 0,
    });
  });

  // Item 32: a groupBy failure must surface (route turns it into 500)
  it("should propagate an error when the status groupBy fails", async () => {
    mockPrisma.validation.groupBy.mockRejectedValue(new Error("groupBy failed"));

    await expect(getBulkJobStats("job-1", "user-1")).rejects.toThrow("groupBy failed");
  });
});
