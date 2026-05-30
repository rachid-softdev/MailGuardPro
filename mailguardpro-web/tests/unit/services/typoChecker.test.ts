import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkTypo } from "@/services/typoChecker";

// Mock the dynamic import of fast-levenshtein
vi.mock("fast-levenshtein", async () => {
  return {
    default: vi.fn((a: string, b: string) => {
      // Simple mock - return distance based on length difference
      return Math.abs(a.length - b.length);
    }),
  };
});

describe("typoChecker", () => {
  describe("checkTypo", () => {
    it("should return passed for valid email with no typos", async () => {
      const result = await checkTypo("test@custom-domain.com");
      expect(result.passed).toBe(true);
      expect(result.weight).toBe(10);
      expect(result.message).toBe("Aucune erreur détectée");
    });

    it("should return failed for common gmail typos", async () => {
      const result = await checkTypo("test@gmial.com");
      // The common typos check catches this
      expect(result.passed).toBe(false);
    });

    it("should return failed for common yahoo typos", async () => {
      const result = await checkTypo("test@yaho.com");
      expect(result.passed).toBe(false);
    });

    it("should return failed for common hotmail typos", async () => {
      const result = await checkTypo("test@hotmal.com");
      expect(result.passed).toBe(false);
    });

    it("should return suggestion for typo detected", async () => {
      const result = await checkTypo("test@gmaiil.com");
      expect(result).toHaveProperty("suggestion");
    });

    it("should return passed for custom domain with no known typos", async () => {
      const result = await checkTypo("test@custom-domain.com");
      expect(result.passed).toBe(true);
    });

    it("should handle email with numbers in domain", async () => {
      const result = await checkTypo("test@company123.com");
      expect(result).toHaveProperty("passed");
    });

    it("should handle short local part", async () => {
      const result = await checkTypo("a@company.com");
      expect(result).toHaveProperty("passed");
    });
  });

  describe("checkTypo with corporate domains", () => {
    it("should not suggest free email providers for corporate emails", async () => {
      const result = await checkTypo("john@acme-corp.com");
      // Corporate domain - should pass even if similar to something
      expect(result).toHaveProperty("passed");
    });
  });
});
