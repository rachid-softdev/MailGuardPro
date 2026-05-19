import { GET } from "@/app/api/v1/validate/route";
import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findUnique: vi.fn(() => Promise.resolve(null)),
      update: vi.fn(() => Promise.resolve({})),
    },
    user: {
      findUnique: vi.fn(() => Promise.resolve({ credits: 100, plan: "FREE" })),
    },
    validation: {
      create: vi.fn(() => Promise.resolve({})),
    },
  },
}));

vi.mock("@/lib/redis", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ success: true, resetAt: new Date() })),
}));

vi.mock("@/services/emailValidator", () => ({
  validateEmail: vi.fn(() =>
    Promise.resolve({
      email: "test@example.com",
      score: 85,
      status: "valid",
      checks: {},
      domain: {},
      processingTimeMs: 100,
    }),
  ),
}));

describe("/api/v1/validate", () => {
  describe("GET", () => {
    it("should return 400 for missing email parameter", async () => {
      const url = new URL("http://localhost:3000/api/v1/validate");
      const req = new NextRequest(url);

      const response = await GET(req);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.success).toBe(false);
    });

    it("should return 400 for invalid email format", async () => {
      const url = new URL("http://localhost:3000/api/v1/validate");
      url.searchParams.set("email", "invalid-email");
      const req = new NextRequest(url);

      const response = await GET(req);

      expect(response.status).toBe(400);
    });

    it("should return validation result for valid email", async () => {
      const url = new URL("http://localhost:3000/api/v1/validate");
      url.searchParams.set("email", "test@example.com");
      const req = new NextRequest(url);

      const response = await GET(req);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty("score");
      expect(json.data).toHaveProperty("status");
    });

    it("should return 429 when rate limit exceeded", async () => {
      // Mock rate limit to return failure
      const { checkRateLimit } = await import("@/lib/redis");
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        success: false,
        resetAt: new Date(),
      });

      const url = new URL("http://localhost:3000/api/v1/validate");
      url.searchParams.set("email", "test@example.com");
      const req = new NextRequest(url);

      const response = await GET(req);

      expect(response.status).toBe(429);
    });

    it("should include processing time in response", async () => {
      const url = new URL("http://localhost:3000/api/v1/validate");
      url.searchParams.set("email", "test@example.com");
      const req = new NextRequest(url);

      const response = await GET(req);

      const json = await response.json();
      expect(json.meta).toHaveProperty("processingTimeMs");
      expect(json.meta).toHaveProperty("requestId");
    });

    it("should handle valid email with all checks", async () => {
      const url = new URL("http://localhost:3000/api/v1/validate");
      url.searchParams.set("email", "john.doe@company.com");
      const req = new NextRequest(url);

      const response = await GET(req);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data.checks).toBeDefined();
    });
  });
});
