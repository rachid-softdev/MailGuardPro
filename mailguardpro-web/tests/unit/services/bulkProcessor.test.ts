import { beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted to properly handle hoisting of mock variables
const { mockPrisma, mockRedis } = vi.hoisted(() => ({
  mockPrisma: {
    bulkJob: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    validation: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
    },
    user: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn((cb: (tx: any) => Promise<any>) => {
      // Execute the callback with a mock transactional client.
      // Delegates bulkJob.create to the top-level mock so tests can spy on it.
      return cb({
        user: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        bulkJob: {
          create: (...args: any[]) => mockPrisma.bulkJob.create(...args),
        },
        validation: {
          create: vi.fn(),
        },
      });
    }),
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
  mockRedis: {
    setex: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    duplicate: vi.fn(() => ({
      connect: vi.fn(),
    })),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/redis", () => ({
  redis: mockRedis,
  publishProgress: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: "job-123" }),
  })),
}));

import {
  getBulkJobResults,
  getBulkJobResultsCursor,
  getBulkJobStats,
  getBulkJobStatus,
  processBulkUpload,
} from "@/services/bulkProcessor";

describe("bulkProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("processBulkUpload", () => {
    it("should reject files larger than 10MB", async () => {
      const largeFile = new File([""], "test.csv", { type: "text/csv" });
      Object.defineProperty(largeFile, "size", { value: 11 * 1024 * 1024 });

      const result = await processBulkUpload(largeFile, "user-123");

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain("File too large");
    });

    it("should reject empty file with no valid emails", async () => {
      const txtFile = new File(["not-an-email"], "test.txt", {
        type: "text/plain",
      });

      const result = await processBulkUpload(txtFile, "user-123");

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain("No valid emails found");
    });

    it("should create bulk job for valid CSV", async () => {
      const csvContent = "email\ntest@example.com\ntest2@example.com";
      const csvFile = new File([csvContent], "test.csv", { type: "text/csv" });

      mockPrisma.bulkJob.create.mockResolvedValue({
        id: "test-uuid-123",
        userId: "user-123",
        filename: "test.csv",
        totalEmails: 2,
      });

      const result = await processBulkUpload(csvFile, "user-123");

      expect(result.success).toBe(true);
      expect(result.jobId).toBeDefined();
      expect(result.totalEmails).toBe(2);
    });

    it("should extract emails from email column", async () => {
      const csvContent = "email\ntest1@example.com\ntest2@example.com";
      const csvFile = new File([csvContent], "test.csv", { type: "text/csv" });

      mockPrisma.bulkJob.create.mockResolvedValue({
        id: "test-uuid-123",
        userId: "user-123",
        filename: "test.csv",
        totalEmails: 2,
      });

      const result = await processBulkUpload(csvFile, "user-123");

      expect(result.success).toBe(true);
      expect(result.totalEmails).toBe(2);
    });

    it("should reject when no valid emails found", async () => {
      const csvContent = "name\nJohn Doe\nJane Doe";
      const csvFile = new File([csvContent], "test.csv", { type: "text/csv" });

      const result = await processBulkUpload(csvFile, "user-123");

      expect(result.success).toBe(false);
      expect(result.errors).toContain("No valid emails found in file");
    });

    it("should enforce maximum row limit", async () => {
      // Create CSV with many rows
      const rows = ["email"];
      for (let i = 0; i < 100001; i++) {
        rows.push(`test${i}@example.com`);
      }
      const csvContent = rows.join("\n");
      const csvFile = new File([csvContent], "test.csv", { type: "text/csv" });

      const result = await processBulkUpload(csvFile, "user-123");

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain("Too many emails");
    });
  });

  describe("getBulkJobStatus", () => {
    it("should return null for non-existent job", async () => {
      mockPrisma.bulkJob.findFirst.mockResolvedValue(null);

      const result = await getBulkJobStatus("nonexistent-job");

      expect(result).toBeNull();
    });

    it("should return job status with percentage", async () => {
      mockPrisma.bulkJob.findFirst.mockResolvedValue({
        id: "job-123",
        status: "PROCESSING",
        totalEmails: 100,
        processed: 50,
        filename: "test.csv",
        createdAt: new Date(),
      });

      const result = await getBulkJobStatus("job-123");

      expect(result).not.toBeNull();
      expect(result?.percentage).toBe(50);
      expect(result?.status).toBe("PROCESSING");
    });

    it("should return job when userId matches (authorized access)", async () => {
      const jobData = {
        id: "job-123",
        userId: "user-abc",
        status: "COMPLETED",
        totalEmails: 200,
        processed: 200,
        filename: "test.csv",
        createdAt: new Date(),
      };
      mockPrisma.bulkJob.findFirst.mockResolvedValue(jobData);

      const result = await getBulkJobStatus("job-123", "user-abc");

      expect(result).not.toBeNull();
      expect(result?.status).toBe("COMPLETED");
      // Must pass userId in the where clause
      expect(mockPrisma.bulkJob.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "job-123", userId: "user-abc" },
        }),
      );
    });

    it("should return null when userId does not match (unauthorized access)", async () => {
      mockPrisma.bulkJob.findFirst.mockResolvedValue(null);

      const result = await getBulkJobStatus("job-123", "user-wrong");

      expect(result).toBeNull();
      expect(mockPrisma.bulkJob.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "job-123", userId: "user-wrong" },
        }),
      );
    });

    it("should return job without userId filter when called without userId (worker usage)", async () => {
      const jobData = {
        id: "job-123",
        status: "PROCESSING",
        totalEmails: 100,
        processed: 50,
        filename: "test.csv",
        createdAt: new Date(),
      };
      mockPrisma.bulkJob.findFirst.mockResolvedValue(jobData);

      const result = await getBulkJobStatus("job-123");

      expect(result).not.toBeNull();
      expect(result?.status).toBe("PROCESSING");
      // Without userId, should only filter by id
      expect(mockPrisma.bulkJob.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "job-123" },
        }),
      );
      // userId should NOT be in the where clause
      const callArgs = mockPrisma.bulkJob.findFirst.mock.calls[0][0];
      expect(callArgs.where.userId).toBeUndefined();
    });
  });

  describe("getBulkJobResults", () => {
    it("should return paginated results", async () => {
      mockPrisma.validation.findMany.mockResolvedValue([{ email: "test1@example.com", score: 80 }]);
      mockPrisma.validation.count.mockResolvedValue(1);

      const result = await getBulkJobResults("job-123", 1, 50);

      expect(result.results).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it("should filter by status", async () => {
      mockPrisma.validation.findMany.mockResolvedValue([]);
      mockPrisma.validation.count.mockResolvedValue(0);

      await getBulkJobResults("job-123", 1, 50, { status: ["invalid"] });

      // Check that the query included status filter
      expect(mockPrisma.validation.findMany).toHaveBeenCalled();
    });
  });

  describe("getBulkJobStats", () => {
    it("should return aggregated statistics", async () => {
      mockPrisma.validation.groupBy.mockResolvedValue([
        { status: "valid", _count: { status: 50 } },
        { status: "invalid", _count: { status: 30 } },
        { status: "risky", _count: { status: 20 } },
      ]);
      mockPrisma.validation.aggregate.mockResolvedValue({
        _avg: { score: 72 },
        _count: { score: 100 },
      });

      const result = await getBulkJobStats("job-123");

      expect(result.valid).toBe(50);
      expect(result.invalid).toBe(30);
      expect(result.risky).toBe(20);
      expect(result.avgScore).toBe(72);
      expect(result.total).toBe(100);
    });

    it("should handle empty results", async () => {
      mockPrisma.validation.groupBy.mockResolvedValue([]);
      mockPrisma.validation.aggregate.mockResolvedValue({
        _avg: { score: null },
        _count: { score: 0 },
      });

      const result = await getBulkJobStats("job-123");

      expect(result.total).toBe(0);
      expect(result.avgScore).toBe(0);
    });

    it("should include unknown status in results", async () => {
      mockPrisma.validation.groupBy.mockResolvedValue([
        { status: "unknown", _count: { status: 10 } },
        { status: "valid", _count: { status: 50 } },
      ]);
      mockPrisma.validation.aggregate.mockResolvedValue({
        _avg: { score: 75 },
        _count: { score: 60 },
      });

      const result = await getBulkJobStats("job-123");

      expect(result.unknown).toBe(10);
    });

    it("should handle score distribution from raw query", async () => {
      mockPrisma.validation.groupBy.mockResolvedValue([
        { status: "valid", _count: { status: 50 } },
      ]);
      mockPrisma.validation.aggregate.mockResolvedValue({
        _avg: { score: 65 },
        _count: { score: 50 },
      });
      mockPrisma.$queryRaw.mockResolvedValue([
        { range: "0-20", count: BigInt(5) },
        { range: "21-40", count: BigInt(10) },
        { range: "41-60", count: BigInt(15) },
        { range: "61-80", count: BigInt(15) },
        { range: "81-100", count: BigInt(5) },
      ]);

      const result = await getBulkJobStats("job-123");

      expect(result.scoreDistribution).toEqual({
        "0-20": 5,
        "21-40": 10,
        "41-60": 15,
        "61-80": 15,
        "81-100": 5,
      });
    });

    it("should fall back to empty distribution if raw query fails", async () => {
      mockPrisma.validation.groupBy.mockResolvedValue([
        { status: "valid", _count: { status: 50 } },
      ]);
      mockPrisma.validation.aggregate.mockResolvedValue({
        _avg: { score: 65 },
        _count: { score: 50 },
      });
      mockPrisma.$queryRaw.mockRejectedValue(new Error("Query failed"));

      const result = await getBulkJobStats("job-123");

      // Should use fallback distribution
      expect(result.scoreDistribution).toEqual({
        "0-20": 0,
        "21-40": 0,
        "41-60": 0,
        "61-80": 0,
        "81-100": 0,
      });
    });
  });

  describe("getBulkJobResultsCursor", () => {
    it("should return results without cursor", async () => {
      mockPrisma.validation.findMany.mockResolvedValue([
        { id: "val-1", email: "test1@example.com", score: 80 },
        { id: "val-2", email: "test2@example.com", score: 70 },
      ]);

      const result = await getBulkJobResultsCursor("job-123", undefined, 50);

      expect(result.results).toHaveLength(2);
      expect(result.hasNextPage).toBe(false);
      expect(result.nextCursor).toBeUndefined();
    });

    it("should return hasNextPage when there are more results", async () => {
      // Return limit + 1 to indicate more pages
      const mockResults = Array(51)
        .fill(null)
        .map((_, i) => ({
          id: `val-${i}`,
          email: `test${i}@example.com`,
          score: 80 - i,
        }));
      mockPrisma.validation.findMany.mockResolvedValue(mockResults);

      const result = await getBulkJobResultsCursor("job-123", undefined, 50);

      expect(result.results).toHaveLength(50); // Should have limit items
      expect(result.hasNextPage).toBe(true);
      expect(result.nextCursor).toBe("val-49"); // Last item's ID
    });

    it("should use cursor for pagination", async () => {
      mockPrisma.validation.findMany.mockResolvedValue([
        { id: "val-99", email: "test99@example.com", score: 50 },
      ]);

      await getBulkJobResultsCursor("job-123", "val-100", 50);

      expect(mockPrisma.validation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            bulkJobId: "job-123",
            id: { lt: "val-100" },
          }),
        }),
      );
    });

    it("should order by createdAt descending", async () => {
      mockPrisma.validation.findMany.mockResolvedValue([]);

      await getBulkJobResultsCursor("job-123");

      expect(mockPrisma.validation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("should handle empty results with cursor", async () => {
      mockPrisma.validation.findMany.mockResolvedValue([]);

      const result = await getBulkJobResultsCursor("job-123", "cursor-value", 50);

      expect(result.results).toHaveLength(0);
      expect(result.hasNextPage).toBe(false);
    });
  });

  describe("processBulkUpload - additional scenarios", () => {
    it("should handle CSV parsing errors", async () => {
      const invalidCsv = 'unclosed"quote';
      const csvFile = new File([invalidCsv], "test.csv", { type: "text/csv" });

      const result = await processBulkUpload(csvFile, "user-123");

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Invalid CSV format");
    });

    it("should extract firstName and lastName from CSV", async () => {
      const csvContent = "email,firstName,lastName\ntest@example.com,John,Doe";
      const csvFile = new File([csvContent], "test.csv", { type: "text/csv" });

      mockPrisma.bulkJob.create.mockResolvedValue({
        id: "test-uuid-123",
        userId: "user-123",
        filename: "test.csv",
        totalEmails: 1,
      });

      await processBulkUpload(csvFile, "user-123");

      const callArg = mockPrisma.bulkJob.create.mock.calls[0][0];
      const emailsJson = JSON.parse(callArg.data.emailsJson);
      expect(emailsJson[0].firstName).toBe("John");
      expect(emailsJson[0].lastName).toBe("Doe");
    });

    it("should extract company from CSV", async () => {
      const csvContent = "email,company\ntest@example.com,Acme Inc";
      const csvFile = new File([csvContent], "test.csv", { type: "text/csv" });

      mockPrisma.bulkJob.create.mockResolvedValue({
        id: "test-uuid-123",
        userId: "user-123",
        filename: "test.csv",
        totalEmails: 1,
      });

      await processBulkUpload(csvFile, "user-123");

      const callArg = mockPrisma.bulkJob.create.mock.calls[0][0];
      const emailsJson = JSON.parse(callArg.data.emailsJson);
      expect(emailsJson[0].company).toBe("Acme Inc");
    });

    it("should handle alternative column names", async () => {
      const csvContent = "mail,first_name,last_name,entreprise\ntest@example.com,John,Doe,Acme";
      const csvFile = new File([csvContent], "test.csv", { type: "text/csv" });

      mockPrisma.bulkJob.create.mockResolvedValue({
        id: "test-uuid-123",
        userId: "user-123",
        filename: "test.csv",
        totalEmails: 1,
      });

      const result = await processBulkUpload(csvFile, "user-123");

      expect(result.success).toBe(true);
      expect(result.totalEmails).toBe(1);
    });

    it("should normalize email to lowercase and trim", async () => {
      const csvContent = "email\nTest@Example.COM\n";
      const csvFile = new File([csvContent], "test.csv", { type: "text/csv" });

      mockPrisma.bulkJob.create.mockResolvedValue({
        id: "test-uuid-123",
        userId: "user-123",
        filename: "test.csv",
        totalEmails: 1,
      });

      await processBulkUpload(csvFile, "user-123");

      const callArg = mockPrisma.bulkJob.create.mock.calls[0][0];
      const emailsJson = JSON.parse(callArg.data.emailsJson);
      expect(emailsJson[0].email).toBe("test@example.com");
    });

    it("should process valid emails and skip invalid ones", async () => {
      const csvContent = "email\nvalid@example.com\ninvalid-email\nanother@valid.com";
      const csvFile = new File([csvContent], "test.csv", { type: "text/csv" });

      mockPrisma.bulkJob.create.mockResolvedValue({
        id: "test-uuid-123",
        userId: "user-123",
        filename: "test.csv",
        totalEmails: 2,
      });

      const result = await processBulkUpload(csvFile, "user-123");

      expect(result.success).toBe(true);
      expect(result.totalEmails).toBe(2);
    });

    // ----- H-02: CSV field sanitization -----

    it("should sanitize <script> tags in firstName field", async () => {
      const csvContent =
        "email,firstName,lastName,company\ntest@example.com,<script>alert(1)</script>,Normal,Acme Corp";
      const csvFile = new File([csvContent], "test.csv", { type: "text/csv" });

      mockPrisma.bulkJob.create.mockResolvedValue({
        id: "test-uuid-123",
        userId: "user-123",
        filename: "test.csv",
        totalEmails: 1,
      });

      await processBulkUpload(csvFile, "user-123");

      const callArg = mockPrisma.bulkJob.create.mock.calls[0][0];
      const emailsJson = JSON.parse(callArg.data.emailsJson);
      expect(emailsJson[0].firstName).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
      expect(emailsJson[0].lastName).toBe("Normal");
    });

    it("should sanitize special characters in company field", async () => {
      const csvContent = "email,company\ntest@example.com,O'Brien & Sons";
      const csvFile = new File([csvContent], "test.csv", { type: "text/csv" });

      mockPrisma.bulkJob.create.mockResolvedValue({
        id: "test-uuid-123",
        userId: "user-123",
        filename: "test.csv",
        totalEmails: 1,
      });

      await processBulkUpload(csvFile, "user-123");

      const callArg = mockPrisma.bulkJob.create.mock.calls[0][0];
      const emailsJson = JSON.parse(callArg.data.emailsJson);
      expect(emailsJson[0].company).toBe("O&#x27;Brien &amp; Sons");
    });

    it("should preserve normal values unchanged", async () => {
      const csvContent = "email,firstName,lastName,company\ntest@example.com,John,Doe,Acme Corp";
      const csvFile = new File([csvContent], "test.csv", { type: "text/csv" });

      mockPrisma.bulkJob.create.mockResolvedValue({
        id: "test-uuid-123",
        userId: "user-123",
        filename: "test.csv",
        totalEmails: 1,
      });

      await processBulkUpload(csvFile, "user-123");

      const callArg = mockPrisma.bulkJob.create.mock.calls[0][0];
      const emailsJson = JSON.parse(callArg.data.emailsJson);
      expect(emailsJson[0].firstName).toBe("John");
      expect(emailsJson[0].lastName).toBe("Doe");
      expect(emailsJson[0].company).toBe("Acme Corp");
    });

    it("should default missing fields to empty string", async () => {
      const csvContent = "email\ntest@example.com";
      const csvFile = new File([csvContent], "test.csv", { type: "text/csv" });

      mockPrisma.bulkJob.create.mockResolvedValue({
        id: "test-uuid-123",
        userId: "user-123",
        filename: "test.csv",
        totalEmails: 1,
      });

      await processBulkUpload(csvFile, "user-123");

      const callArg = mockPrisma.bulkJob.create.mock.calls[0][0];
      const emailsJson = JSON.parse(callArg.data.emailsJson);
      expect(emailsJson[0].firstName).toBe("");
      expect(emailsJson[0].lastName).toBe("");
      expect(emailsJson[0].company).toBe("");
    });
  });
});
