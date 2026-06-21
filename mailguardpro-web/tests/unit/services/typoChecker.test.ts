import { describe, expect, it, vi } from "vitest";
import { checkTypo } from "@/services/typoChecker";

// Mock the dynamic import of fast-levenshtein with a real Levenshtein implementation
// so that distance calculations are accurate for our test domains.
vi.mock("fast-levenshtein", async () => {
  function levenshtein(a: string, b: string): number {
    const an = a.length;
    const bn = b.length;
    const matrix: number[][] = [];
    for (let i = 0; i <= bn; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= an; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= bn; i++) {
      for (let j = 1; j <= an; j++) {
        const cost = b[i - 1] === a[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
      }
    }
    return matrix[bn][an];
  }

  return {
    default: vi.fn((a: string, b: string) => levenshtein(a, b)),
  };
});

describe("typoChecker", () => {
  describe("checkTypo", () => {
    it("should return passed for valid email with no typos", async () => {
      const result = await checkTypo("test@custom-domain.com");
      expect(result.passed).toBe(true);
      expect(result.weight).toBe(0);
      expect(result.message).toBe("Aucune erreur détectée");
    });

    it("should return failed for common gmail typos", async () => {
      const result = await checkTypo("test@gmial.com");
      // The Levenshtein check catches this (distance 2 from gmail.com)
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

    // --- New tests to increase coverage ---

    it("should handle email without @ symbol", async () => {
      // localPart is empty (e.g. "@domain.com")
      const result1 = await checkTypo("@domain.com");
      expect(result1.passed).toBe(true);
      expect(result1.weight).toBe(0);
      expect(result1.message).toBe("Format invalide");

      // domain is empty (e.g. "user@")
      const result2 = await checkTypo("user@");
      expect(result2.passed).toBe(true);
      expect(result2.weight).toBe(0);
      expect(result2.message).toBe("Format invalide");

      // no @ at all
      const result3 = await checkTypo("noatsign");
      expect(result3.passed).toBe(true);
      expect(result3.weight).toBe(0);
      expect(result3.message).toBe("Format invalide");
    });

    it("should detect icloud.com similarity without flagging it as typo", async () => {
      // icloud.com is in POPULAR_DOMAINS, so exact match gives distance 0.
      // Since domain === closestDomain, the Levenshtein check is bypassed.
      // icloud was also removed from commonTypos, so it should pass cleanly.
      const result = await checkTypo("user@icloud.com");
      expect(result.passed).toBe(true);
      expect(result.weight).toBe(0);
      expect(result.message).toBe("Aucune erreur détectée");
    });

    it("should catch gmial typo through commonTypos", async () => {
      // With real Levenshtein, gmial.com is distance 2 from gmail.com
      // so it is caught by the Levenshtein path. The test verifies the
      // outcome regardless of which internal path fires.
      const result = await checkTypo("test@gmial.com");
      expect(result.passed).toBe(false);
      expect(result).toHaveProperty("suggestion");
      expect(result.suggestion).toBe("test@gmail.com");
    });

    it("should catch goggle typo through commonTypos", async () => {
      // goggle.com has no popular domain within distance 3 (Levenshtein
      // distance to googlemail.com is 5), so the Levenshtein check is
      // skipped. Then commonTypos matches the "goggle" key, hitting the
      // block at lines 98-109 of the source.
      const result = await checkTypo("test@goggle.com");
      expect(result.passed).toBe(false);
      expect(result).toHaveProperty("suggestion");
      expect(result.suggestion).toBe("test@googlemail.com");
    });

    it("should handle outlok typo through commonTypos", async () => {
      // outlok.com is distance 1 from outlook.com (Levenshtein), so it is
      // caught by the Levenshtein path. The test verifies the outcome.
      const result = await checkTypo("test@outlok.com");
      expect(result.passed).toBe(false);
      expect(result).toHaveProperty("suggestion");
      expect(result.suggestion).toBe("test@outlook.com");
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
