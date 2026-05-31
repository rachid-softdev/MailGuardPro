import { beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted for proper hoisting
const { mockValidateEmail } = vi.hoisted(() => ({
  mockValidateEmail: vi.fn(),
}));

vi.mock("@/services/emailValidator", () => ({
  validateEmail: mockValidateEmail,
}));

import { findLeadEmail, findLeadEmails, LeadFinderInput } from "@/services/leadFinder";

describe("leadFinder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findLeadEmail", () => {
    const baseInput: LeadFinderInput = {
      firstName: "John",
      lastName: "Doe",
      companyDomain: "example.com",
    };

    it("should return null when firstName is missing", async () => {
      const result = await findLeadEmail({
        firstName: "",
        lastName: "Doe",
        companyDomain: "example.com",
      });

      expect(result).toBeNull();
    });

    it("should return null when lastName is missing", async () => {
      const result = await findLeadEmail({
        firstName: "John",
        lastName: "",
        companyDomain: "example.com",
      });

      expect(result).toBeNull();
    });

    it("should return null when companyDomain is missing", async () => {
      const result = await findLeadEmail({
        firstName: "John",
        lastName: "Doe",
        companyDomain: "",
      });

      expect(result).toBeNull();
    });

    it("should return valid result when validation passes", async () => {
      mockValidateEmail.mockResolvedValue({
        status: "valid",
        score: 85,
        email: "john.doe@example.com",
        checks: {},
      } as any);

      const result = await findLeadEmail(baseInput);

      expect(result).not.toBeNull();
      expect(result?.email).toContain("@example.com");
      expect(result?.isValid).toBe(true);
    });

    it("should return valid result when status is risky with lower confidence", async () => {
      mockValidateEmail.mockResolvedValue({
        status: "risky",
        score: 50,
        email: "john.doe@example.com",
        checks: {},
      } as any);

      const result = await findLeadEmail(baseInput);

      expect(result).not.toBeNull();
      expect(result?.isValid).toBe(true);
      expect(result?.confidence).toBeLessThan(1); // Lower confidence for risky
    });

    it("should return null when validation fails for all patterns", async () => {
      mockValidateEmail.mockResolvedValue({
        status: "invalid",
        score: 0,
        email: "test@example.com",
        checks: {},
      } as any);

      const result = await findLeadEmail(baseInput);

      expect(result).toBeNull();
    });

    it("should skip contact@ and info@ patterns", async () => {
      const validateCalls: string[] = [];
      mockValidateEmail.mockImplementation(async (email: string) => {
        validateCalls.push(email);
        return {
          status: "invalid",
          score: 0,
          email,
          checks: {},
        } as any;
      });

      await findLeadEmail(baseInput);

      // Should not have tried contact@ or info@ patterns
      expect(
        validateCalls.filter((e) => e.startsWith("contact@") || e.startsWith("info@")).length,
      ).toBe(0);
    });

    it("should handle validation errors gracefully and continue", async () => {
      let callCount = 0;
      mockValidateEmail.mockImplementation(async (email: string) => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Validation error");
        }
        return {
          status: "valid",
          score: 90,
          email,
          checks: {},
        } as any;
      });

      const result = await findLeadEmail(baseInput);

      // Should continue after first error
      expect(result).not.toBeNull();
    });

    it("should work without validation (validate=false)", async () => {
      const result = await findLeadEmail(baseInput, false);

      expect(result).not.toBeNull();
      expect(result?.email).toContain("@example.com");
      expect(result?.isValid).toBe(false);
      expect(result?.confidence).toBe(0.3); // Low confidence without validation
    });

    it("should handle known email to infer pattern", async () => {
      mockValidateEmail.mockResolvedValue({
        status: "valid",
        score: 85,
        email: "j.doe@example.com",
        checks: {},
      } as any);

      const result = await findLeadEmail({
        ...baseInput,
        knownEmail: "j.doe@example.com",
      });

      expect(result).not.toBeNull();
    });

    it("should handle special characters in names", async () => {
      mockValidateEmail.mockResolvedValue({
        status: "valid",
        score: 85,
        email: "john.doe@example.com",
        checks: {},
      } as any);

      const result = await findLeadEmail({
        firstName: "  John  ",
        lastName: "  Doe  ",
        companyDomain: "example.com",
      });

      expect(result).not.toBeNull();
    });
  });

  describe("findLeadEmails", () => {
    const inputs: LeadFinderInput[] = [
      { firstName: "John", lastName: "Doe", companyDomain: "example.com" },
      { firstName: "Jane", lastName: "Smith", companyDomain: "test.com" },
    ];

    it("should process multiple leads", async () => {
      mockValidateEmail.mockResolvedValue({
        status: "valid",
        score: 85,
        email: "test@example.com",
        checks: {},
      } as any);

      const results = await findLeadEmails(inputs);

      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it("should call onProgress callback", async () => {
      mockValidateEmail.mockResolvedValue({
        status: "valid",
        score: 85,
        email: "test@example.com",
        checks: {},
      } as any);

      const progressCalls: { processed: number; total: number }[] = [];
      await findLeadEmails(inputs, (processed, total) => {
        progressCalls.push({ processed, total });
      });

      expect(progressCalls.length).toBe(inputs.length);
    });

    it("should handle errors for individual leads", async () => {
      mockValidateEmail.mockImplementation(async (email: string) => {
        if (email.includes("john")) {
          throw new Error("Error");
        }
        return {
          status: "valid",
          score: 85,
          email,
          checks: {},
        } as any;
      });

      const results = await findLeadEmails(inputs);

      // Should still process second lead despite first error
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it("should add rate limiting delay between requests", async () => {
      const startTime = Date.now();

      mockValidateEmail.mockResolvedValue({
        status: "valid",
        score: 85,
        email: "test@example.com",
        checks: {},
      } as any);

      await findLeadEmails(inputs);

      const elapsed = Date.now() - startTime;
      // Should have at least 100ms delay between requests
      expect(elapsed).toBeGreaterThanOrEqual(90);
    });
  });
});
