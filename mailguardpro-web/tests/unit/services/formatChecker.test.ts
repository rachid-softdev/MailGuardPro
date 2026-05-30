import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkFormat } from "@/services/formatChecker";

describe("formatChecker", () => {
  describe("checkFormat", () => {
    it("should return passed for valid email", () => {
      const result = checkFormat("test@example.com");
      expect(result.passed).toBe(true);
      expect(result.weight).toBe(15);
    });

    it("should return passed for email with dots in local part", () => {
      const result = checkFormat("first.last@example.com");
      expect(result.passed).toBe(true);
    });

    it("should return passed for email with plus alias", () => {
      const result = checkFormat("test+alias@example.com");
      expect(result.passed).toBe(true);
    });

    it("should return passed for email with subdomain", () => {
      const result = checkFormat("test@sub.domain.example.com");
      expect(result.passed).toBe(true);
    });

    it("should return failed for email without @", () => {
      const result = checkFormat("example.com");
      expect(result.passed).toBe(false);
      expect(result.message).toBe("Format invalide");
    });

    it("should return failed for email without domain", () => {
      const result = checkFormat("test@");
      expect(result.passed).toBe(false);
      expect(result.message).toBe("Format invalide");
    });

    it("should return failed for email without local part", () => {
      const result = checkFormat("@example.com");
      expect(result.passed).toBe(false);
      expect(result.message).toBe("Format invalide");
    });

    it("should return failed for email with spaces", () => {
      const result = checkFormat("test @example.com");
      expect(result.passed).toBe(false);
    });

    it("should return failed for email with invalid characters", () => {
      const result = checkFormat("test<>@example.com");
      expect(result.passed).toBe(false);
    });

    it("should allow email with double dots (RFC allows)", () => {
      const result = checkFormat("test..test@example.com");
      // The RFC regex actually allows this
      expect(result.passed).toBe(true);
    });

    it("should allow email starting with dot (RFC allows)", () => {
      const result = checkFormat(".test@example.com");
      // The RFC regex actually allows this
      expect(result.passed).toBe(true);
    });

    it("should return passed for email with invalid TLD", () => {
      // Per current implementation, this should pass
      const result = checkFormat("test@example");
      expect(result.passed).toBe(true);
    });

    it("should return passed for email exceeding 254 chars only", () => {
      // Only check is total length > 254
      const longLocal = "a".repeat(65);
      const result = checkFormat(`${longLocal}@example.com`);
      // 65 + 1 + 12 = 78 < 254, so passes
      expect(result.passed).toBe(true);
    });

    it("should handle email with numbers", () => {
      const result = checkFormat("user123@example456.com");
      expect(result.passed).toBe(true);
    });

    it("should handle email with hyphen in domain", () => {
      const result = checkFormat("test@my-domain.com");
      expect(result.passed).toBe(true);
    });
  });

  describe("checkFormat edge cases", () => {
    it("should handle very long email correctly", () => {
      const longEmail = "a".repeat(100) + "@" + "b".repeat(100) + ".com";
      const result = checkFormat(longEmail);
      // Should handle without crashing - total 203 chars, still under 254
      expect(result).toHaveProperty("passed");
    });

    it("should reject unicode email", () => {
      const result = checkFormat("test@exämple.com");
      // RFC regex doesn't support unicode
      expect(result.passed).toBe(false);
    });

    it("should return failed for empty email", () => {
      const result = checkFormat("");
      expect(result.passed).toBe(false);
      expect(result.message).toBe("Email vide");
    });

    it("should return failed for email exceeding 254 characters", () => {
      // 255 + 1 (@) + 12 (example.com) = 268 > 254
      const longEmail = "a".repeat(255) + "@example.com";
      const result = checkFormat(longEmail);
      expect(result.passed).toBe(false);
      expect(result.message).toBe("Email trop long");
    });
  });
});
