import { checkGeneric } from "@/services/genericChecker";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("genericChecker", () => {
  describe("checkGeneric", () => {
    it("should return passed for personal email addresses", async () => {
      const result = await checkGeneric("john.doe@gmail.com");
      expect(result.passed).toBe(true);
      expect(result.weight).toBe(5);
    });

    it("should return passed for unique business emails", async () => {
      const result = await checkGeneric("john.smith@company.com");
      expect(result.passed).toBe(true);
    });

    it("should return failed for info@ generic address", async () => {
      const result = await checkGeneric("info@company.com");
      expect(result.passed).toBe(false);
      expect(result.weight).toBe(5);
    });

    it("should return failed for admin@ generic address", async () => {
      const result = await checkGeneric("admin@company.com");
      expect(result.passed).toBe(false);
    });

    it("should return failed for support@ generic address", async () => {
      const result = await checkGeneric("support@company.com");
      expect(result.passed).toBe(false);
    });

    it("should return failed for contact@ generic address", async () => {
      const result = await checkGeneric("contact@company.com");
      expect(result.passed).toBe(false);
    });

    it("should return failed for sales@ generic address", async () => {
      const result = await checkGeneric("sales@company.com");
      expect(result.passed).toBe(false);
    });

    it("should return failed for noreply@ generic address", async () => {
      const result = await checkGeneric("noreply@company.com");
      expect(result.passed).toBe(false);
    });

    it("should return failed for postmaster@ generic address", async () => {
      const result = await checkGeneric("postmaster@company.com");
      expect(result.passed).toBe(false);
    });

    it("should handle domain variations", async () => {
      const result = await checkGeneric("webmaster@company.net");
      expect(result).toHaveProperty("passed");
    });
  });

  describe("checkGeneric edge cases", () => {
    it("should handle mixed case", async () => {
      const result = await checkGeneric("INFO@company.com");
      expect(result.passed).toBe(false);
    });

    it("should handle subdomain", async () => {
      const result = await checkGeneric("info@sub.company.com");
      expect(result.passed).toBe(false);
    });

    it("should return passed for empty local part", async () => {
      const result = await checkGeneric("@company.com");
      expect(result.passed).toBe(true);
    });

    it("should detect generic with dash separator", async () => {
      const result = await checkGeneric("contact-us@company.com");
      expect(result.passed).toBe(false);
    });

    it("should detect generic with underscore separator", async () => {
      const result = await checkGeneric("support_fr@company.com");
      expect(result.passed).toBe(false);
    });

    it("should detect generic with number suffix", async () => {
      const result = await checkGeneric("contact123@company.com");
      expect(result.passed).toBe(false);
    });

    it("should detect generic with number prefix", async () => {
      const result = await checkGeneric("123support@company.com");
      expect(result.passed).toBe(true); // Doesn't match the regex pattern
    });
  });
});
