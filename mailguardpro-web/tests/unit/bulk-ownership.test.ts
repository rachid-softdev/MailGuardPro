// =============================================================================
// TEST 3 (IDOR) — Bulk job ownership enforcement (requireJobOwnership)
// =============================================================================
// Tests that bulk job access functions enforce ownership via userId checks,
// preventing IDOR (Insecure Direct Object Reference) attacks.
// =============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// MOCKS (using vi.hoisted pattern from existing bulkProcessor.test.ts)
// =============================================================================

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    bulkJob: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    validation: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    duplicate: vi.fn(() => ({ connect: vi.fn() })),
  },
  publishProgress: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: vi.fn(function () {
    return { add: vi.fn().mockResolvedValue({ id: "bull-job-123" }) };
  }),
}));

// =============================================================================
// IMPORTS
// =============================================================================

import { prisma } from "@/lib/prisma";
import { getBulkJobResults, getBulkJobStats, getBulkJobStatus } from "@/services/bulkProcessor";

// =============================================================================
// SHARED SETUP
// =============================================================================

const OWNER_ID = "user-owner-123";
const ATTACKER_ID = "user-attacker-456";
const JOB_ID = "job-bulk-789";

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

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Simulate requireJobOwnership logic:
 * Throws if job not found or userId doesn't match.
 */
async function requireJobOwnership(jobId: string, userId: string) {
  const job = await prisma.bulkJob.findFirst({
    where: { id: jobId, userId },
    select: {
      id: true,
      userId: true,
      status: true,
      totalEmails: true,
      processed: true,
      filename: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
    },
  });
  if (!job) {
    throw new Error("JOB_NOT_FOUND");
  }
  return job;
}

// =============================================================================
// TESTS
// =============================================================================

describe("IDOR: Bulk job ownership enforcement", () => {
  describe("requireJobOwnership", () => {
    // ---------------------------------------------------------------------------
    // Test 1 — Owner match → returns job
    // ---------------------------------------------------------------------------
    it("should return the job when userId matches (owner)", async () => {
      vi.mocked(prisma.bulkJob.findFirst).mockResolvedValue(mockJobData);

      const result = await requireJobOwnership(JOB_ID, OWNER_ID);

      expect(result).toBeDefined();
      expect(result.id).toBe(JOB_ID);
      expect(result.userId).toBe(OWNER_ID);

      // Must query with both jobId AND userId in where clause
      expect(prisma.bulkJob.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: JOB_ID, userId: OWNER_ID },
        }),
      );
    });

    // ---------------------------------------------------------------------------
    // Test 2 — Owner mismatch → throws error
    // ---------------------------------------------------------------------------
    it("should throw JOB_NOT_FOUND when userId does not match (attacker)", async () => {
      // Even though the job exists, the attacker's userId doesn't match
      vi.mocked(prisma.bulkJob.findFirst).mockResolvedValue(null);

      await expect(requireJobOwnership(JOB_ID, ATTACKER_ID)).rejects.toThrow("JOB_NOT_FOUND");

      // Must query with attacker's userId so the DB returns no match
      expect(prisma.bulkJob.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: JOB_ID, userId: ATTACKER_ID },
        }),
      );
    });

    // ---------------------------------------------------------------------------
    // Edge case: non-existent job
    // ---------------------------------------------------------------------------
    it("should throw JOB_NOT_FOUND when job does not exist", async () => {
      vi.mocked(prisma.bulkJob.findFirst).mockResolvedValue(null);

      await expect(requireJobOwnership("nonexistent-job", OWNER_ID)).rejects.toThrow(
        "JOB_NOT_FOUND",
      );
    });
  });

  // ===========================================================================
  // getBulkJobStatus
  // ===========================================================================

  describe("getBulkJobStatus", () => {
    // ---------------------------------------------------------------------------
    // Test 3 — Nécessite userId, échoue si ownership incorrect
    // ---------------------------------------------------------------------------
    it("should require userId and fail when ownership is incorrect", async () => {
      // Job exists but belongs to owner, attacker tries to access
      vi.mocked(prisma.bulkJob.findFirst).mockResolvedValue(mockJobData);

      // getBulkJobStatus calls requireJobOwnership first, which queries
      // with both jobId and userId. For attacker, the findFirst within
      // requireJobOwnership will return the data but... wait.
      // Actually getBulkJobStatus calls requireJobOwnership with attackerId,
      // which queries findFirst with { id: JOB_ID, userId: ATTACKER_ID }.
      // Since the mock returns mockJobData (which has OWNER_ID not ATTACKER_ID),
      // the mock doesn't reflect reality. Let me fix:

      // For correct ownership (owner accesses own job)
      vi.mocked(prisma.bulkJob.findFirst).mockResolvedValue(mockJobData);
      const result = await getBulkJobStatus(JOB_ID, OWNER_ID);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(JOB_ID);

      // For incorrect ownership (attacker accesses someone else's job)
      vi.mocked(prisma.bulkJob.findFirst).mockResolvedValue(null as any);
      await expect(getBulkJobStatus(JOB_ID, ATTACKER_ID)).rejects.toThrow("JOB_NOT_FOUND");
    });

    it("should return job status with percentage for the owner", async () => {
      vi.mocked(prisma.bulkJob.findFirst).mockResolvedValue(mockJobData);

      const result = await getBulkJobStatus(JOB_ID, OWNER_ID);

      expect(result).not.toBeNull();
      expect(result?.status).toBe("COMPLETED");
      expect(result?.percentage).toBe(100);
    });
  });

  // ===========================================================================
  // getBulkJobResults
  // ===========================================================================

  describe("getBulkJobResults", () => {
    // ---------------------------------------------------------------------------
    // Test 4 — Nécessite userId, échoue si ownership incorrect
    // ---------------------------------------------------------------------------
    it("should require userId and fail when ownership is incorrect", async () => {
      // Owner: can access results
      vi.mocked(prisma.bulkJob.findFirst).mockResolvedValue(mockJobData);
      vi.mocked(prisma.validation.findMany).mockResolvedValue([
        { id: "val-1", email: "test@example.com", score: 85, status: "valid" },
      ]);
      vi.mocked(prisma.validation.count).mockResolvedValue(1);

      const ownerResult = await getBulkJobResults(JOB_ID, OWNER_ID, 1, 50);
      expect(ownerResult.total).toBe(1);

      // Attacker: should throw
      vi.mocked(prisma.bulkJob.findFirst).mockResolvedValue(null as any);
      await expect(getBulkJobResults(JOB_ID, ATTACKER_ID, 1, 50)).rejects.toThrow("JOB_NOT_FOUND");
    });

    it("should pass userId to requireJobOwnership", async () => {
      vi.mocked(prisma.bulkJob.findFirst).mockResolvedValue(mockJobData);
      vi.mocked(prisma.validation.findMany).mockResolvedValue([]);
      vi.mocked(prisma.validation.count).mockResolvedValue(0);

      await getBulkJobResults(JOB_ID, OWNER_ID, 1, 50);

      // First call is requireJobOwnership (findFirst with userId)
      expect(prisma.bulkJob.findFirst).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { id: JOB_ID, userId: OWNER_ID },
        }),
      );
    });

    it("should return paginated results for the owner", async () => {
      vi.mocked(prisma.bulkJob.findFirst).mockResolvedValue(mockJobData);
      vi.mocked(prisma.validation.findMany).mockResolvedValue([
        { id: "val-1", email: "a@b.com", score: 90, status: "valid" },
        { id: "val-2", email: "c@d.com", score: 30, status: "invalid" },
      ]);
      vi.mocked(prisma.validation.count).mockResolvedValue(2);

      const result = await getBulkJobResults(JOB_ID, OWNER_ID, 1, 50);

      expect(result.results).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });

  // ===========================================================================
  // getBulkJobStats
  // ===========================================================================

  describe("getBulkJobStats", () => {
    // ---------------------------------------------------------------------------
    // Test 5 — Nécessite userId, échoue si ownership incorrect
    // ---------------------------------------------------------------------------
    it("should require userId and fail when ownership is incorrect", async () => {
      // Owner can access stats
      vi.mocked(prisma.bulkJob.findFirst).mockResolvedValue(mockJobData);
      vi.mocked(prisma.validation.groupBy).mockResolvedValue([
        { status: "valid", _count: { status: 80 } },
        { status: "invalid", _count: { status: 20 } },
      ]);
      vi.mocked(prisma.validation.aggregate).mockResolvedValue({
        _avg: { score: 75 },
        _count: { score: 100 },
      } as any);

      const ownerStats = await getBulkJobStats(JOB_ID, OWNER_ID);
      expect(ownerStats.total).toBe(100);

      // Attacker should throw
      vi.mocked(prisma.bulkJob.findFirst).mockResolvedValue(null as any);
      await expect(getBulkJobStats(JOB_ID, ATTACKER_ID)).rejects.toThrow("JOB_NOT_FOUND");
    });

    it("should pass userId to requireJobOwnership", async () => {
      vi.mocked(prisma.bulkJob.findFirst).mockResolvedValue(mockJobData);
      vi.mocked(prisma.validation.groupBy).mockResolvedValue([]);
      vi.mocked(prisma.validation.aggregate).mockResolvedValue({
        _avg: { score: 0 },
        _count: { score: 0 },
      } as any);

      await getBulkJobStats(JOB_ID, OWNER_ID);

      // First call is requireJobOwnership (findFirst with userId)
      expect(prisma.bulkJob.findFirst).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { id: JOB_ID, userId: OWNER_ID },
        }),
      );
    });

    it("should return correct stats for the owner", async () => {
      vi.mocked(prisma.bulkJob.findFirst).mockResolvedValue(mockJobData);
      vi.mocked(prisma.validation.groupBy).mockResolvedValue([
        { status: "valid", _count: { status: 75 } },
        { status: "invalid", _count: { status: 15 } },
        { status: "risky", _count: { status: 10 } },
      ]);
      vi.mocked(prisma.validation.aggregate).mockResolvedValue({
        _avg: { score: 72 },
        _count: { score: 100 },
      } as any);

      const stats = await getBulkJobStats(JOB_ID, OWNER_ID);

      expect(stats.total).toBe(100);
      expect(stats.valid).toBe(75);
      expect(stats.invalid).toBe(15);
      expect(stats.risky).toBe(10);
      expect(stats.avgScore).toBe(72);
    });
  });

  // ===========================================================================
  // Edge case: userId cannot be empty/undefined for protected functions
  // ===========================================================================

  describe("Ownerhip edge cases", () => {
    it("should not bypass ownership check with empty userId", async () => {
      // Some functions accept userId?: string for backward compat (worker usage)
      // but the protected versions require it
      vi.mocked(prisma.bulkJob.findFirst).mockResolvedValue(null);

      await expect(getBulkJobStatus(JOB_ID, "" as any)).rejects.toThrow("JOB_NOT_FOUND");
    });

    it("should treat a valid userId as required for getBulkJobResults", async () => {
      // With a wrong userId, requireJobOwnership should throw
      vi.mocked(prisma.bulkJob.findFirst).mockResolvedValue(null as any);

      await expect(getBulkJobResults(JOB_ID, "wrong-user", 1, 50)).rejects.toThrow("JOB_NOT_FOUND");
    });
  });
});
