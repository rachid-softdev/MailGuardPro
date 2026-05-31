import { describe, expect, it } from "vitest";
import { checkFreeProvider, isCustomDomain } from "@/services/freeProviderChecker";

describe("freeProviderChecker", () => {
  describe("checkFreeProvider", () => {
    it("should return passed for custom domain", () => {
      const result = checkFreeProvider("john@company.com");

      expect(result.passed).toBe(true);
      expect(result.message).toBe("Email professionnel");
      expect(result.weight).toBe(0);
    });

    it("should return failed for Gmail", () => {
      const result = checkFreeProvider("john@gmail.com");

      expect(result.passed).toBe(false);
      expect(result.message).toContain("Fournisseur gratuit");
      expect(result.message).toContain("gmail.com");
      expect(result.detail).toContain("fournisseur gratuit");
    });

    it("should return failed for Google Mail", () => {
      const result = checkFreeProvider("john@googlemail.com");

      expect(result.passed).toBe(false);
      expect(result.detail).toBeDefined();
    });

    it("should return failed for Outlook", () => {
      const result = checkFreeProvider("john@outlook.com");

      expect(result.passed).toBe(false);
      expect(result.message).toContain("outlook.com");
    });

    it("should return failed for Hotmail", () => {
      const result = checkFreeProvider("john@hotmail.com");

      expect(result.passed).toBe(false);
    });

    it("should return failed for Yahoo", () => {
      const result = checkFreeProvider("john@yahoo.com");

      expect(result.passed).toBe(false);
    });

    it("should return failed for Yahoo UK", () => {
      const result = checkFreeProvider("john@yahoo.co.uk");

      expect(result.passed).toBe(false);
    });

    it("should return failed for iCloud", () => {
      const result = checkFreeProvider("john@icloud.com");

      expect(result.passed).toBe(false);
    });

    it("should return failed for Apple domains", () => {
      const result = checkFreeProvider("john@me.com");

      expect(result.passed).toBe(false);
    });

    it("should return failed for AOL", () => {
      const result = checkFreeProvider("john@aol.com");

      expect(result.passed).toBe(false);
    });

    it("should return failed for Proton Mail", () => {
      const result = checkFreeProvider("john@protonmail.com");

      expect(result.passed).toBe(false);
    });

    it("should return failed for Proton.me", () => {
      const result = checkFreeProvider("john@proton.me");

      expect(result.passed).toBe(false);
    });

    it("should return failed for GMX", () => {
      const result = checkFreeProvider("john@gmx.com");

      expect(result.passed).toBe(false);
    });

    it("should return failed for GMX Germany", () => {
      const result = checkFreeProvider("john@gmx.de");

      expect(result.passed).toBe(false);
    });

    it("should return failed for Yandex", () => {
      const result = checkFreeProvider("john@yandex.com");

      expect(result.passed).toBe(false);
    });

    it("should return failed for Yandex Russia", () => {
      const result = checkFreeProvider("john@yandex.ru");

      expect(result.passed).toBe(false);
    });

    it("should return failed for Zoho", () => {
      const result = checkFreeProvider("john@zoho.com");

      expect(result.passed).toBe(false);
    });

    it("should return failed for Tutanota", () => {
      const result = checkFreeProvider("john@tutanota.com");

      expect(result.passed).toBe(false);
    });

    it("should handle case-insensitive domains", () => {
      const result = checkFreeProvider("john@GMAIL.COM");

      expect(result.passed).toBe(false);
    });

    it("should return passed for email without domain", () => {
      const result = checkFreeProvider("invalid-email");

      expect(result.passed).toBe(true);
      expect(result.message).toBe("Domaine invalide");
    });

    it("should return passed for empty email", () => {
      const result = checkFreeProvider("");

      expect(result.passed).toBe(true);
    });

    it("should return passed for domain without @", () => {
      const result = checkFreeProvider("example.com");

      expect(result.passed).toBe(true);
    });
  });

  describe("isCustomDomain", () => {
    it("should return true for custom domain", () => {
      const result = isCustomDomain("john@company.com");

      expect(result).toBe(true);
    });

    it("should return false for Gmail", () => {
      const result = isCustomDomain("john@gmail.com");

      expect(result).toBe(false);
    });

    it("should return false for Outlook", () => {
      const result = isCustomDomain("john@outlook.com");

      expect(result).toBe(false);
    });

    it("should return false for invalid email", () => {
      const result = isCustomDomain("invalid");

      expect(result).toBe(false);
    });

    it("should return false for empty string", () => {
      const result = isCustomDomain("");

      expect(result).toBe(false);
    });

    it("should handle case-insensitive domains", () => {
      const result = isCustomDomain("john@COMPANY.COM");

      expect(result).toBe(true);
    });
  });
});
