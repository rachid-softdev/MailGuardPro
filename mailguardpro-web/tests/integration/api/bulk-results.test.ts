// =============================================================================
// CRIT-1: Bulk results endpoint — getBulkJobResults argument validation
//
// Tests that:
// 1. getBulkJobResults is called with the correct 5 arguments
//    (jobId, userId, page, limit, filters)
// 2. The function returns proper results with valid data
// 3. Wrong userId throws JOB_NOT_FOUND (ownership enforced)
// =============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// MOCKS (using vi.hoisted pattern from existing tests)
// =============================================================================

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    bulkJob: {
      findFirst: vi.fn(),
    },
    validation: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    duplicate: vi.fn(() => ({ connect: vi.fn() })),
  },
  publishProgress: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: vi.fn(function () {
    return { add: vi.fn().mockResolvedValue({ id: "bull-job-123" }) };
  }),
}));

vi.mock("@/lib/emailSanitizer", () => ({
  sanitizeForHtml: vi.fn((s: string) => s),
}));

// =============================================================================
// IMPORTS
// =============================================================================

import { getBulkJobResults } from "@/services/bulkProcessor";

// =============================================================================
// SHARED TEST DATA
// =============================================================================

const JOB_ID = "job-bulk-789";
const OWNER_ID = "user-owner-123";
const ATTACKER_ID = "user-attacker-456";

const mockJobData = {
  id: JOB_ID,
  userId: OWNER_ID,
  status: "COMPLETED",
  totalEmails: 100,
  processed: 100,
  filename: "test.csv",
  createdAt: new Date(),
  startedAt: new Date(),
  completedAt: new Date(),
};

describe("CRIT-1: Bulk results endpoint (getBulkJobResults)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Test 1 — getBulkJobResults is called with the correct 5 arguments
  // ==========================================================================

  it("should call getBulkJobResults with jobId, userId, page, limit, and filters", async () => {
    vi.mocked(mockPrisma.bulkJob.findFirst).mockResolvedValue(mockJobData);
    vi.mocked(mockPrisma.validation.findMany).mockResolvedValue([
      { id: "val-1", email: "test@example.com", score: 85, status: "valid" },
    ]);
    vi.mocked(mockPrisma.validation.count).mockResolvedValue(1);

    const result = await getBulkJobResults(JOB_ID, OWNER_ID, 1, 50, { status: ["valid"] });

    // Verify requireJobOwnership called with correct args
    expect(mockPrisma.bulkJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: JOB_ID, userId: OWNER_ID },
      }),
    );

    // Verify findMany called with pagination
    expect(mockPrisma.validation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bulkJobId: JOB_ID, status: { in: ["valid"] } },
        skip: 0,
        take: 50,
        orderBy: { createdAt: "desc" },
      }),
    );

    expect(result.results).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
  });

  it("should pass the 5th argument (filters) correctly with all filter types", async () => {
    vi.mocked(mockPrisma.bulkJob.findFirst).mockResolvedValue(mockJobData);
    vi.mocked(mockPrisma.validation.findMany).mockResolvedValue([]);
    vi.mocked(mockPrisma.validation.count).mockResolvedValue(0);

    const filters = {
      status: ["valid", "invalid"],
      minScore: 50,
      maxScore: 100,
    };

    await getBulkJobResults(JOB_ID, OWNER_ID, 2, 10, filters);

    // Verify filters passed to findMany
    expect(mockPrisma.validation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bulkJobId: JOB_ID,
          status: { in: ["valid", "invalid"] },
          score: { gte: 50, lte: 100 },
        }),
        skip: 10, // (2-1) * 10
        take: 10,
      }),
    );
  });

  it("should not pass filters when no filters are provided", async () => {
    vi.mocked(mockPrisma.bulkJob.findFirst).mockResolvedValue(mockJobData);
    vi.mocked(mockPrisma.validation.findMany).mockResolvedValue([]);
    vi.mocked(mockPrisma.validation.count).mockResolvedValue(0);

    await getBulkJobResults(JOB_ID, OWNER_ID, 1, 50);

    // Should query with only bulkJobId, no filters
    expect(mockPrisma.validation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bulkJobId: JOB_ID },
      }),
    );

    // Should NOT have status or score filters
    const callArgs = mockPrisma.validation.findMany.mock.calls[0][0];
    expect(callArgs.where.status).toBeUndefined();
    expect(callArgs.where.score).toBeUndefined();
  });

  // ==========================================================================
  // Test 2 — Response has valid data structure
  // ==========================================================================

  it("should return paginated results with correct structure", async () => {
    vi.mocked(mockPrisma.bulkJob.findFirst).mockResolvedValue(mockJobData);
    vi.mocked(mockPrisma.validation.findMany).mockResolvedValue([
      { id: "val-1", email: "alice@example.com", score: 95, status: "valid" },
      { id: "val-2", email: "bob@example.com", score: 20, status: "invalid" },
    ]);
    vi.mocked(mockPrisma.validation.count).mockResolvedValue(2);

    const result = await getBulkJobResults(JOB_ID, OWNER_ID, 1, 50);

    expect(result).toHaveProperty("results");
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("page");
    expect(result).toHaveProperty("limit");
    expect(result).toHaveProperty("totalPages");

    expect(Array.isArray(result.results)).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
    expect(result.totalPages).toBe(1);
  });

  it("should return empty results array when no validations exist", async () => {
    vi.mocked(mockPrisma.bulkJob.findFirst).mockResolvedValue(mockJobData);
    vi.mocked(mockPrisma.validation.findMany).mockResolvedValue([]);
    vi.mocked(mockPrisma.validation.count).mockResolvedValue(0);

    const result = await getBulkJobResults(JOB_ID, OWNER_ID, 1, 50);

    expect(result.results).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("should paginate results correctly", async () => {
    const mockResults = Array.from({ length: 10 }, (_, i) => ({
      id: `val-${i}`,
      email: `user${i}@test.com`,
      score: 50 + i,
      status: "valid",
    }));

    vi.mocked(mockPrisma.bulkJob.findFirst).mockResolvedValue(mockJobData);
    vi.mocked(mockPrisma.validation.findMany).mockResolvedValue(mockResults);
    vi.mocked(mockPrisma.validation.count).mockResolvedValue(25);

    const result = await getBulkJobResults(JOB_ID, OWNER_ID, 2, 10);

    expect(result.results).toHaveLength(10);
    expect(result.total).toBe(25);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
    expect(result.totalPages).toBe(3); // ceil(25/10) = 3

    // Verify skip = (2-1) * 10 = 10
    expect(mockPrisma.validation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  // ==========================================================================
  // Test 3 — Wrong userId throws JOB_NOT_FOUND
  // ==========================================================================

  it("should throw JOB_NOT_FOUND when userId does not match (attacker)", async () => {
    // Job exists but belongs to owner; attacker queries with their own ID
    vi.mocked(mockPrisma.bulkJob.findFirst).mockResolvedValue(null);

    await expect(getBulkJobResults(JOB_ID, ATTACKER_ID, 1, 50)).rejects.toThrow("JOB_NOT_FOUND");

    // Must query with attacker's userId so the DB returns no match
    expect(mockPrisma.bulkJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: JOB_ID, userId: ATTACKER_ID },
      }),
    );
  });

  it("should throw JOB_NOT_FOUND when job does not exist", async () => {
    vi.mocked(mockPrisma.bulkJob.findFirst).mockResolvedValue(null);

    await expect(getBulkJobResults("non-existent-job", OWNER_ID, 1, 50)).rejects.toThrow(
      "JOB_NOT_FOUND",
    );
  });

  it("should throw JOB_NOT_FOUND for empty userId", async () => {
    vi.mocked(mockPrisma.bulkJob.findFirst).mockResolvedValue(null);

    await expect(getBulkJobResults(JOB_ID, "", 1, 50)).rejects.toThrow("JOB_NOT_FOUND");
  });
});
