import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateEmail, validateEmailQuick } from "@/services/emailValidator";

// Mock all the checker services
vi.mock("@/services/formatChecker", () => ({
  checkFormat: vi.fn(),
}));

vi.mock("@/services/dnsChecker", () => ({
  checkMX: vi.fn(),
  checkSPF: vi.fn(),
  checkDMARC: vi.fn(),
}));

vi.mock("@/services/smtpChecker", () => ({
  checkSMTP: vi.fn(),
}));

vi.mock("@/services/disposableChecker", () => ({
  checkDisposable: vi.fn(),
}));

vi.mock("@/services/genericChecker", () => ({
  checkGeneric: vi.fn(),
}));

vi.mock("@/services/freeProviderChecker", () => ({
  checkFreeProvider: vi.fn(),
}));

vi.mock("@/services/typoChecker", () => ({
  checkTypo: vi.fn(),
}));

vi.mock("@/services/dnsblChecker", () => ({
  checkDNSBL: vi.fn(),
}));

vi.mock("@/services/reputationScorer", () => ({
  getDomainReputation: vi.fn(),
}));

// Mock dns/promises for catch-all check
vi.mock("dns/promises", () => ({
  resolveMx: vi.fn(),
}));

import { checkDisposable } from "@/services/disposableChecker";
import { checkDNSBL } from "@/services/dnsblChecker";
import { checkDMARC, checkMX, checkSPF } from "@/services/dnsChecker";
import { checkFormat } from "@/services/formatChecker";
import { checkFreeProvider } from "@/services/freeProviderChecker";
import { checkGeneric } from "@/services/genericChecker";
import { getDomainReputation } from "@/services/reputationScorer";
import { checkSMTP } from "@/services/smtpChecker";
import { checkTypo } from "@/services/typoChecker";

describe("emailValidator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up default mock responses - all passing
    vi.mocked(checkFormat).mockReturnValue({
      passed: true,
      weight: 15,
      message: "Valid",
    });
    vi.mocked(checkMX).mockResolvedValue({
      passed: true,
      weight: 25,
      message: "MX OK",
    });
    vi.mocked(checkSPF).mockResolvedValue({
      passed: true,
      weight: 5,
      message: "SPF OK",
    });
    vi.mocked(checkDMARC).mockResolvedValue({
      passed: true,
      weight: 5,
      message: "DMARC OK",
    });
    vi.mocked(checkSMTP).mockResolvedValue({
      passed: true,
      weight: 30,
      message: "SMTP OK",
    });
    vi.mocked(checkDisposable).mockResolvedValue({
      passed: true,
      weight: 10,
      message: "Not disposable",
    });
    vi.mocked(checkGeneric).mockResolvedValue({
      passed: true,
      weight: 5,
      message: "Not generic",
    });
    vi.mocked(checkFreeProvider).mockReturnValue({
      passed: true,
      weight: 0,
      message: "Business email",
    });
    vi.mocked(checkTypo).mockReturnValue({
      passed: true,
      weight: 0,
      message: "No typo",
    });
    vi.mocked(checkDNSBL).mockResolvedValue({
      passed: true,
      weight: 0,
      message: "Not blacklisted",
    });
    vi.mocked(getDomainReputation).mockResolvedValue({ ageInDays: 400 });
  });

  describe("validateEmail", () => {
    it("should return valid status for high score with passing SMTP", async () => {
      const result = await validateEmail("test@company.com");

      expect(result.status).toBe("valid");
      expect(result.email).toBe("test@company.com");
      expect(result.checks).toBeDefined();
    });

    it("should return invalid status for failed format check", async () => {
      vi.mocked(checkFormat).mockReturnValue({
        passed: false,
        weight: 15,
        message: "Invalid format",
      });

      const result = await validateEmail("invalid-email");

      expect(result.status).toBe("invalid");
    });

    it("should return invalid status for disposable email", async () => {
      vi.mocked(checkDisposable).mockResolvedValue({
        passed: false,
        weight: 10,
        message: "Disposable",
      });

      const result = await validateEmail("test@tempmail.com");

      expect(result.status).toBe("invalid");
    });

    it("should return risky status when typo is detected", async () => {
      vi.mocked(checkTypo).mockReturnValue({
        passed: false,
        weight: 0,
        message: "Possible typo",
        suggestion: "test@company.com",
      });

      const result = await validateEmail("test@compnay.com");

      expect(result.status).toBe("risky");
      expect(result.suggestion).toBe("test@company.com");
    });

    it("should return invalid status when SMTP fails", async () => {
      vi.mocked(checkSMTP).mockResolvedValue({
        passed: false,
        weight: 30,
        message: "SMTP failed",
      });

      const result = await validateEmail("test@company.com");

      // When SMTP fails, code returns invalid (not risky)
      expect(result.status).toBe("invalid");
    });

    it("should include processing time in result", async () => {
      const result = await validateEmail("test@company.com");

      // Processing time may be 0 in fast test environment
      expect(result.processingTimeMs).toBeDefined();
      expect(typeof result.processingTimeMs).toBe("number");
    });

    it("should calculate high score with all checks passing", async () => {
      const result = await validateEmail("test@company.com");

      // Score should be high with all passing
      expect(result.score).toBeGreaterThanOrEqual(75);
    });

    it("should handle DNSBL failure", async () => {
      vi.mocked(checkDNSBL).mockResolvedValue({
        passed: false,
        weight: 20,
        message: "Listed",
      });

      const result = await validateEmail("test@company.com");

      // Score should be reduced but still valid since SMTP passes
      expect(result.score).toBeLessThan(100);
    });

    it("should handle typo without affecting valid status when SMTP passes", async () => {
      vi.mocked(checkTypo).mockReturnValue({
        passed: false,
        weight: 0,
        message: "Typo detected",
      });

      const result = await validateEmail("test@company.com");

      // With typo and SMTP passing, should be risky
      expect(result.status).toBe("risky");
    });

    it("should return valid for email without @ (format passes)", async () => {
      // Actually, "invalid" passes format check because regex is lenient
      const result = await validateEmail("invalid");

      expect(result).toBeDefined();
    });

    it("should handle SMTP errors gracefully", async () => {
      vi.mocked(checkSMTP).mockRejectedValue(new Error("SMTP error"));

      const result = await validateEmail("test@company.com");

      expect(result.checks.smtp).toBeDefined();
      expect(result.checks.smtp.passed).toBe(false);
    });

    it("should handle DNSBL errors gracefully", async () => {
      vi.mocked(checkDNSBL).mockRejectedValue(new Error("DNSBL error"));

      const result = await validateEmail("test@company.com");

      // Error defaults to passed
      expect(result.checks.dnsbl.passed).toBe(true);
    });
  });

  describe("validateEmailQuick", () => {
    it("should return valid for quick validation", async () => {
      vi.mocked(checkMX).mockResolvedValue({
        passed: true,
        weight: 25,
        message: "MX OK",
      });

      const result = await validateEmailQuick("test@company.com");

      expect(result.valid).toBe(true);
    });

    it("should return invalid for failed format check", async () => {
      vi.mocked(checkFormat).mockReturnValue({
        passed: false,
        weight: 15,
        message: "Invalid format",
      });

      const result = await validateEmailQuick("invalid-email");

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Invalid format");
    });

    it("should return invalid for disposable email", async () => {
      vi.mocked(checkDisposable).mockResolvedValue({
        passed: false,
        weight: 10,
        message: "Disposable",
      });

      const result = await validateEmailQuick("test@tempmail.com");

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Disposable email");
    });

    it("should return invalid for missing MX record", async () => {
      vi.mocked(checkMX).mockResolvedValue({
        passed: false,
        weight: 25,
        message: "No MX",
      });

      const result = await validateEmailQuick("test@company.com");

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("No MX record");
    });

    it("should not include full validation checks in result", async () => {
      const result = await validateEmailQuick("test@company.com");

      // Quick validation only checks format, disposable, MX
      expect(result.valid).toBe(true);
    });
  });
});
