import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/validate/bulk/route";

// Mock dependencies
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve({ user: { id: "user-123" } })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(() => Promise.resolve({ credits: 100, plan: "FREE" })),
      update: vi.fn(() => Promise.resolve({ credits: 98 })),
    },
    bulkJob: {
      create: vi.fn(() => Promise.resolve({ id: "job-123" })),
    },
    validation: {
      createMany: vi.fn(() => Promise.resolve({ count: 2 })),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

// Mock redis more completely
vi.mock("@/lib/redis", () => ({
  redis: {
    setex: vi.fn().mockResolvedValue("OK"),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    duplicate: vi.fn(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
    })),
  },
  publishProgress: vi.fn().mockResolvedValue(undefined),
}));

// Mock the bulk processor to avoid actual file processing
vi.mock("@/services/bulkProcessor", () => ({
  processBulkUpload: vi.fn().mockResolvedValue({
    success: true,
    jobId: "test-job-123",
    totalEmails: 2,
  }),
}));

describe.skip("/api/v1/validate/bulk", () => {
  describe("POST", () => {
    // Helper to create form data with a file
    const createFormRequest = (fileContent: string, filename = "test.csv") => {
      const formData = new FormData();
      const file = new File([fileContent], filename, { type: "text/csv" });
      formData.append("file", file);

      const req = new NextRequest("http://localhost:3000/api/v1/validate/bulk", {
        method: "POST",
        body: formData,
      });

      return req;
    };

    it("should return 401 when not authenticated", async () => {
      const { auth } = await import("@/lib/auth");
      vi.mocked(auth).mockResolvedValueOnce(null as any);

      const req = createFormRequest("email\ntest@example.com");

      const response = await POST(req);

      expect(response.status).toBe(401);
    });

    it("should return 400 when no file provided", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/validate/bulk", {
        method: "POST",
      });

      const response = await POST(req);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.success).toBe(false);
    });

    it("should return 400 for non-CSV file", async () => {
      const req = createFormRequest("test@example.com", "test.txt");

      const response = await POST(req);

      expect(response.status).toBe(400);
    });

    it("should return 400 for empty CSV", async () => {
      const req = createFormRequest("");

      const response = await POST(req);

      expect(response.status).toBe(400);
    });

    it("should create bulk job for valid CSV", async () => {
      const csvContent = "email\ntest1@example.com\ntest2@example.com";
      const req = createFormRequest(csvContent);

      const response = await POST(req);

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty("jobId");
    });

    it("should handle CSV with additional columns", async () => {
      const csvContent = "email,firstName,lastName\ntest@example.com,John,Doe";
      const req = createFormRequest(csvContent);

      const response = await POST(req);

      expect(response.status).toBe(201);
    });
  });
});
