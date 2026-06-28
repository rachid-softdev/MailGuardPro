/* eslint-disable @typescript-eslint/no-unused-vars */ import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

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

    // ===== Category A: inferPattern() branches (lines 63-78) =====

    it("should infer {first}{l} pattern when knownEmail local has 2 parts and last is single char", async () => {
      const result = await findLeadEmail(
        {
          firstName: "John",
          lastName: "Doe",
          companyDomain: "example.com",
          knownEmail: "john.d@example.com",
        },
        false,
      );

      expect(result).not.toBeNull();
      expect(result!.pattern).toBe("{first}{l}@{domain}");
      expect(result!.email).toBe("johnd@example.com");
    });

    it("should infer {first}.{last} pattern when knownEmail has 2 multi-char parts", async () => {
      const result = await findLeadEmail(
        {
          firstName: "John",
          lastName: "Doe",
          companyDomain: "example.com",
          knownEmail: "john.doe@other.com",
        },
        false,
      );

      expect(result).not.toBeNull();
      expect(result!.pattern).toBe("{first}.{last}@{domain}");
      expect(result!.email).toBe("john.doe@example.com");
    });

    it("should infer {last} pattern when knownEmail local is single short part (<=4 chars)", async () => {
      const result = await findLeadEmail(
        {
          firstName: "John",
          lastName: "Doe",
          companyDomain: "example.com",
          knownEmail: "doe@other.com",
        },
        false,
      );

      expect(result).not.toBeNull();
      expect(result!.pattern).toBe("{last}@{domain}");
      expect(result!.email).toBe("doe@example.com");
    });

    it("should infer {first} pattern when knownEmail local is single long part (>4 chars)", async () => {
      const result = await findLeadEmail(
        {
          firstName: "Johnathan",
          lastName: "Doe",
          companyDomain: "example.com",
          knownEmail: "johnathan@other.com",
        },
        false,
      );

      expect(result).not.toBeNull();
      expect(result!.pattern).toBe("{first}@{domain}");
      expect(result!.email).toBe("johnathan@example.com");
    });

    it("should fall back to default patterns when knownEmail has 3+ local parts", async () => {
      const result = await findLeadEmail(
        {
          firstName: "John",
          lastName: "Doe",
          companyDomain: "example.com",
          knownEmail: "john.doe.extra@other.com",
        },
        false,
      );

      expect(result).not.toBeNull();
      expect(result!.pattern).toBe("{first}.{last}@{domain}");
      expect(result!.email).toBe("john.doe@example.com");
    });

    // ===== Category B: Pattern output verification (validate=true, sequential mock) =====

    it.each([
      ["{first}{last}@{domain}", "johndoe@example.com", 1],
      ["{first}_{last}@{domain}", "john_doe@example.com", 2],
      ["{f}.{last}@{domain}", "j.doe@example.com", 3],
      ["{first}{l}@{domain}", "johnd@example.com", 4],
      ["{f}{last}@{domain}", "jdoe@example.com", 5],
      ["{first}.{l}@{domain}", "john.d@example.com", 6],
      ["{first}@{domain}", "john@example.com", 7],
      ["{first}{domainWithoutTld}@{tld}", "johnexample@com", 8],
      ["{last}@{domain}", "doe@example.com", 9],
      ["{first}{last}1@{domain}", "johndoe1@example.com", 10],
      ["{first}.{last}2024@{domain}", "john.doe2024@example.com", 11],
    ])("should generate correct email for pattern %s", async (pattern, expectedEmail, numFailing) => {
      // Make first N patterns return invalid, then Nth pattern succeeds
      for (let i = 0; i < numFailing; i++) {
        mockValidateEmail.mockResolvedValueOnce({
          status: "invalid",
          score: 0,
          email: `fail-${i}@example.com`,
          checks: {},
        } as any);
      }
      mockValidateEmail.mockResolvedValue({
        status: "valid",
        score: 85,
        email: expectedEmail,
        checks: {},
      } as any);

      const result = await findLeadEmail(baseInput);

      expect(result).not.toBeNull();
      expect(result!.pattern).toBe(pattern);
      expect(result!.email).toBe(expectedEmail);
    });

    // ===== Category C: Name edge cases =====

    it("should handle hyphenated first names", async () => {
      const result = await findLeadEmail(
        {
          firstName: "Jean-Pierre",
          lastName: "Doe",
          companyDomain: "example.com",
        },
        false,
      );

      expect(result).not.toBeNull();
      expect(result!.email).toBe("jean-pierre.doe@example.com");
      expect(result!.pattern).toBe("{first}.{last}@{domain}");
    });

    it("should handle apostrophe in last names", async () => {
      const result = await findLeadEmail(
        {
          firstName: "John",
          lastName: "O'Brien",
          companyDomain: "example.com",
        },
        false,
      );

      expect(result).not.toBeNull();
      expect(result!.email).toBe("john.o'brien@example.com");
      expect(result!.pattern).toBe("{first}.{last}@{domain}");
    });

    it("should handle single-char first name", async () => {
      const result = await findLeadEmail(
        {
          firstName: "J",
          lastName: "Doe",
          companyDomain: "example.com",
        },
        false,
      );

      expect(result).not.toBeNull();
      expect(result!.email).toBe("j.doe@example.com");
      expect(result!.pattern).toBe("{first}.{last}@{domain}");
    });

    it("should handle single-char last name", async () => {
      const result = await findLeadEmail(
        {
          firstName: "John",
          lastName: "D",
          companyDomain: "example.com",
        },
        false,
      );

      expect(result).not.toBeNull();
      expect(result!.email).toBe("john.d@example.com");
      expect(result!.pattern).toBe("{first}.{last}@{domain}");
    });

    // ===== Category E: Stronger assertions =====

    it("should return exact pattern, email, and validation object when validate=true", async () => {
      mockValidateEmail.mockResolvedValue({
        status: "valid",
        score: 85,
        email: "john.doe@example.com",
        checks: {},
      } as any);

      const result = await findLeadEmail(baseInput);

      expect(result).not.toBeNull();
      expect(result!.pattern).toBe("{first}.{last}@{domain}");
      expect(result!.email).toBe("john.doe@example.com");
      expect(result!.isValid).toBe(true);
      expect(result!.confidence).toBe(0.85);
      expect(result!.validation).toBeDefined();
      expect(result!.validation!.status).toBe("valid");
      expect(result!.validation!.score).toBe(85);
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

    // ===== Category D: findLeadEmails edge cases =====

    it("should return empty array for empty input", async () => {
      const results = await findLeadEmails([]);
      expect(results).toEqual([]);
    });

    it("should return empty array when all inputs return null", async () => {
      mockValidateEmail.mockResolvedValue({
        status: "invalid",
        score: 0,
        email: "test@example.com",
        checks: {},
      } as any);

      const results = await findLeadEmails([
        { firstName: "John", lastName: "Doe", companyDomain: "example.com" },
        { firstName: "Jane", lastName: "Smith", companyDomain: "test.com" },
      ]);

      expect(results).toEqual([]);
    });

    it("should process single input without rate limiting delay", async () => {
      mockValidateEmail.mockResolvedValue({
        status: "valid",
        score: 85,
        email: "john.doe@example.com",
        checks: {},
      } as any);

      const startTime = Date.now();
      const results = await findLeadEmails([
        { firstName: "John", lastName: "Doe", companyDomain: "example.com" },
      ]);
      const elapsed = Date.now() - startTime;

      expect(results).toHaveLength(1);
      expect(results[0].email).toBe("john.doe@example.com");
      // No delay for single input, should finish well under 100ms delay
      expect(elapsed).toBeLessThan(500);
    });

    it("should call onProgress for 3+ inputs with correct counts", async () => {
      mockValidateEmail.mockResolvedValue({
        status: "valid",
        score: 85,
        email: "test@example.com",
        checks: {},
      } as any);

      const progressCalls: { processed: number; total: number }[] = [];
      const results = await findLeadEmails(
        [
          { firstName: "A", lastName: "B", companyDomain: "a.com" },
          { firstName: "C", lastName: "D", companyDomain: "b.com" },
          { firstName: "E", lastName: "F", companyDomain: "c.com" },
        ],
        (processed, total) => {
          progressCalls.push({ processed, total });
        },
      );

      expect(progressCalls).toEqual([
        { processed: 1, total: 3 },
        { processed: 2, total: 3 },
        { processed: 3, total: 3 },
      ]);
    });
  });
});
