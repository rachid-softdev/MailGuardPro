import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — must be before imports because vitest hoists vi.mock calls
// ---------------------------------------------------------------------------

vi.mock("uuid", () => ({
  v4: vi.fn(() => "mock-request-id"),
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  loggerApi: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rateLimits", () => ({
  checkRateLimitByPlan: vi.fn(),
}));

vi.mock("@/services/bulkProcessor", () => ({
  processBulkUpload: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports — these resolve to the mocked modules above
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/v1/validate/bulk/route";
import { auth } from "@/lib/auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { checkRateLimitByPlan } from "@/lib/rateLimits";
import { processBulkUpload } from "@/services/bulkProcessor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createFormRequest(
  fileContent: string,
  filename = "test.csv",
  mimeType = "text/csv",
): NextRequest {
  const formData = new FormData();
  const file = new File([fileContent], filename, { type: mimeType });
  formData.append("file", file);
  return new NextRequest("http://localhost:3000/api/v1/validate/bulk", {
    method: "POST",
    body: formData,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("/api/v1/validate/bulk", () => {
  describe("POST", () => {
    beforeEach(() => {
      vi.clearAllMocks();

      // Default happy-path mocks — individual tests override what they need
      vi.mocked(auth).mockResolvedValue({ user: { id: "user-123", email: "test@test.com" } });
      vi.mocked(validateCsrfOrigin).mockReturnValue({ valid: true });
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ credits: 100, plan: "FREE" });
      vi.mocked(checkRateLimitByPlan).mockResolvedValue({
        success: true,
        remaining: 1,
        limit: 1,
        resetAt: Date.now() + 3600000,
      });
      vi.mocked(processBulkUpload).mockResolvedValue({
        success: true,
        jobId: "test-job-123",
        totalEmails: 2,
      });
    });

    // --- Auth & CSRF ---

    it("should return 403 when CSRF validation fails", async () => {
      vi.mocked(validateCsrfOrigin).mockReturnValueOnce({
        valid: false,
        error: "Missing Origin and Referer headers",
      });

      const req = createFormRequest("test@example.com");
      const response = await POST(req);

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("Missing Origin and Referer headers");
    });

    it("should return 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValueOnce(null);

      const req = createFormRequest("test@example.com");
      const response = await POST(req);

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("Authentication required");
    });

    // --- Rate limiting ---

    it("should return 429 when rate limit exceeded", async () => {
      vi.mocked(checkRateLimitByPlan).mockResolvedValueOnce({
        success: false,
        remaining: 0,
        limit: 1,
        resetAt: Date.now() + 3600000,
      });

      const req = createFormRequest("test@example.com");
      const response = await POST(req);

      expect(response.status).toBe(429);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Rate limit exceeded");
    });

    // --- File validation ---

    it("should return 400 when no file provided", async () => {
      // Create a multipart request without a "file" field so formData() does not throw
      const emptyForm = new FormData();
      const req = new NextRequest("http://localhost:3000/api/v1/validate/bulk", {
        method: "POST",
        body: emptyForm,
      });
      const response = await POST(req);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("No file provided");
    });

    it("should return 400 when file extension is not CSV", async () => {
      const req = createFormRequest("test@example.com", "data.txt", "text/plain");
      const response = await POST(req);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("File must be a CSV file");
    });

    it("should return 400 when MIME type is wrong despite .csv extension", async () => {
      const req = createFormRequest("test@example.com", "test.csv", "text/plain");
      const response = await POST(req);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("File must be a CSV file");
    });

    // --- Happy path ---

    it("should return 200 with jobId when CSV is valid", async () => {
      const csvContent = "email\ntest1@example.com\ntest2@example.com";
      const req = createFormRequest(csvContent);

      const response = await POST(req);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty("jobId");
      expect(json.data.jobId).toBe("test-job-123");
      expect(json.data).toHaveProperty("totalEmails");
      expect(json.data.totalEmails).toBe(2);
    });

    // --- processBulkUpload error handling ---

    it("should return 400 when processBulkUpload returns failure", async () => {
      vi.mocked(processBulkUpload).mockResolvedValueOnce({
        success: false,
        errors: ["No valid emails found in file"],
      });

      const req = createFormRequest("not-an-email");
      const response = await POST(req);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.errors).toContain("No valid emails found in file");
    });

    it("should return 500 when processBulkUpload throws an unexpected error", async () => {
      vi.mocked(processBulkUpload).mockRejectedValueOnce(new Error("Database connection lost"));

      const req = createFormRequest("test@example.com");
      const response = await POST(req);

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("Internal server error");
    });

    // --- Argument verification ---

    it("should call processBulkUpload with correct arguments", async () => {
      const req = createFormRequest("email\ntest@example.com");
      await POST(req);

      expect(processBulkUpload).toHaveBeenCalledTimes(1);
      expect(processBulkUpload).toHaveBeenCalledWith(expect.any(File), "user-123", undefined, {
        requestId: "mock-request-id",
      });
    });

    it("should call checkRateLimitByPlan with correct arguments", async () => {
      const req = createFormRequest("email\ntest@example.com");
      await POST(req);

      expect(checkRateLimitByPlan).toHaveBeenCalledWith("user-123", "FREE", "bulk");
    });

    it("should use plan from database for rate limiting", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        credits: 500,
        plan: "PRO",
      });

      const req = createFormRequest("email\ntest@example.com");
      await POST(req);

      expect(checkRateLimitByPlan).toHaveBeenCalledWith("user-123", "PRO", "bulk");
    });

    it("should fallback to FREE plan when user DB record is missing", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

      const req = createFormRequest("email\ntest@example.com");
      await POST(req);

      expect(checkRateLimitByPlan).toHaveBeenCalledWith("user-123", "FREE", "bulk");
    });
  });
});
