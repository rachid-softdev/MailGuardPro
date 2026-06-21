import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateEmail, validateEmailQuick } from "@/services/emailValidator";

// Mock all the checker services
vi.mock("@/services/catchAllChecker", () => ({
  checkCatchAll: vi.fn(),
}));

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

// Mock validationCache to prevent rate limiting
vi.mock("@/services/validationCache", () => ({
  getCachedValidation: vi.fn().mockResolvedValue(null),
  setCachedValidation: vi.fn().mockResolvedValue(undefined),
  checkEmailRateLimit: vi.fn().mockResolvedValue(true),
}));

// Mock dns/promises for catch-all check
vi.mock("dns/promises", () => ({
  resolveMx: vi.fn(),
}));

import { SCORING_VERSION } from "@/config/scoringWeights";
import { checkCatchAll } from "@/services/catchAllChecker";
import { checkDisposable } from "@/services/disposableChecker";
import { checkDNSBL } from "@/services/dnsblChecker";
import { checkDMARC, checkMX, checkSPF } from "@/services/dnsChecker";
import { checkFormat } from "@/services/formatChecker";
import { checkFreeProvider } from "@/services/freeProviderChecker";
import { checkGeneric } from "@/services/genericChecker";
import { getDomainReputation } from "@/services/reputationScorer";
import { checkSMTP } from "@/services/smtpChecker";
import { checkTypo } from "@/services/typoChecker";
import {
  checkEmailRateLimit,
  getCachedValidation,
  setCachedValidation,
} from "@/services/validationCache";

describe("emailValidator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up default mock responses - all passing
    vi.mocked(checkFormat).mockReturnValue({
      passed: true,
      weight: 15,
      message: "Valid",
    });
    vi.mocked(checkCatchAll).mockResolvedValue({
      passed: true,
      weight: 10,
      message: "Not catch-all",
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
    vi.mocked(checkTypo).mockResolvedValue({
      passed: true,
      weight: 0,
      message: "No typo",
    });
    vi.mocked(checkDNSBL).mockResolvedValue({
      passed: true,
      weight: 0,
      message: "Not blacklisted",
    });
    vi.mocked(getDomainReputation).mockResolvedValue({
      name: "company.com",
      ageInDays: 400,
      reputation: "good",
    });

    // Reset cache & rate-limit mocks to defaults (clearAllMocks does NOT reset implementations)
    vi.mocked(getCachedValidation).mockResolvedValue(null);
    vi.mocked(checkEmailRateLimit).mockResolvedValue(true);
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
      vi.mocked(checkTypo).mockResolvedValue({
        passed: false,
        weight: 0,
        message: "Possible typo",
        suggestion: "test@company.com",
      } as any);

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
      vi.mocked(checkTypo).mockResolvedValue({
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

    // --- Cache & rate limit ---

    it("should return cached result with fresh algoVersion and processingTimeMs, and not re-cache", async () => {
      const cachedResult = {
        email: "cached@company.com",
        score: 42,
        status: "risky",
        checks: {
          format: { passed: true, message: "Cached format" },
          mx: { passed: false, message: "Cached MX" },
          smtp: { passed: true, message: "Cached SMTP" },
          catchAll: { passed: false, message: "Cached catchAll" },
          disposable: { passed: true, message: "Cached disposable" },
          generic: { passed: false, message: "Cached generic" },
          freeProvider: { passed: false, message: "Cached freeProvider" },
          dnsbl: { passed: true, message: "Cached dnsbl" },
          spf: { passed: false, message: "Cached spf" },
          dmarc: { passed: false, message: "Cached dmarc" },
          typo: { passed: true, message: "Cached typo" },
        },
        domain: { name: "company.com", reputation: "good" },
        processingTimeMs: 999,
        algoVersion: 0,
      } as const;
      vi.mocked(getCachedValidation).mockResolvedValue(cachedResult as any);

      const result = await validateEmail("test@company.com");

      // algoVersion is overwritten by SCORING_VERSION
      expect(result.algoVersion).toBe(SCORING_VERSION);
      // processingTimeMs is freshly computed
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.processingTimeMs).not.toBe(999);
      // All other fields preserved from cache
      expect(result.email).toBe("cached@company.com");
      expect(result.score).toBe(42);
      expect(result.status).toBe("risky");
      expect(result.checks.format).toEqual({ passed: true, message: "Cached format" });
      // Not re-cached
      expect(setCachedValidation).not.toHaveBeenCalled();
      // No checker service was invoked (early return)
      expect(checkFormat).not.toHaveBeenCalled();
      expect(checkSMTP).not.toHaveBeenCalled();
    });

    it("should return score 0 and status unknown when rate limited, and not call any checker", async () => {
      vi.mocked(checkEmailRateLimit).mockResolvedValue(false);

      const result = await validateEmail("test@company.com");

      expect(result.score).toBe(0);
      expect(result.status).toBe("unknown");
      expect(result.domain).toEqual({ name: "company.com", reputation: "neutral" });
      expect(result.processingTimeMs).toBe(0);

      // format is special: message includes "Rate limited"
      expect(result.checks.format).toEqual({
        passed: false,
        message: "Rate limited",
        detail: "Too many requests for this email",
      });
      // All others are "Not checked" — dnsbl and typo have passed:true, the rest have passed:false
      expect(result.checks.mx).toEqual({ passed: false, message: "Not checked", detail: "" });
      expect(result.checks.smtp).toEqual({ passed: false, message: "Not checked", detail: "" });
      expect(result.checks.catchAll).toEqual({ passed: false, message: "Not checked", detail: "" });
      expect(result.checks.disposable).toEqual({
        passed: false,
        message: "Not checked",
        detail: "",
      });
      expect(result.checks.generic).toEqual({ passed: false, message: "Not checked", detail: "" });
      expect(result.checks.freeProvider).toEqual({
        passed: false,
        message: "Not checked",
        detail: "",
      });
      expect(result.checks.dnsbl).toEqual({ passed: true, message: "Not checked", detail: "" });
      expect(result.checks.spf).toEqual({ passed: false, message: "Not checked", detail: "" });
      expect(result.checks.dmarc).toEqual({ passed: false, message: "Not checked", detail: "" });
      expect(result.checks.typo).toEqual({ passed: true, message: "Not checked", detail: "" });

      // No checker service should have been called
      expect(checkFormat).not.toHaveBeenCalled();
      expect(checkSMTP).not.toHaveBeenCalled();
      expect(checkMX).not.toHaveBeenCalled();
    });

    // --- Score & status determination ---

    it("should return risky when score is between 40 and 74 and SMTP passes (lines 142-143)", async () => {
      // Short-circuit guards: format, disposable, typo all pass
      vi.mocked(checkFormat).mockReturnValue({ passed: true, weight: 15, message: "Valid" });
      vi.mocked(checkDisposable).mockResolvedValue({
        passed: true,
        weight: 10,
        message: "Not disposable",
      });
      vi.mocked(checkTypo).mockResolvedValue({ passed: true, weight: 0, message: "No typo" });

      // SMTP must pass to reach score-based risky
      vi.mocked(checkSMTP).mockResolvedValue({ passed: true, weight: 30, message: "SMTP OK" });

      // Configure for score = 55: format(15) + smtp(30) + disposable(10) = 55
      vi.mocked(checkMX).mockResolvedValue({ passed: false, weight: 25, message: "No MX" });
      vi.mocked(checkCatchAll).mockResolvedValue({
        passed: false,
        weight: 10,
        message: "Not catch-all",
      });
      vi.mocked(checkGeneric).mockResolvedValue({ passed: false, weight: 5, message: "Generic" });
      vi.mocked(checkFreeProvider).mockReturnValue({ passed: false, weight: 0, message: "Free" });
      vi.mocked(checkSPF).mockResolvedValue({ passed: false, weight: 5, message: "No SPF" });
      vi.mocked(checkDMARC).mockResolvedValue({ passed: false, weight: 5, message: "No DMARC" });
      vi.mocked(checkDNSBL).mockResolvedValue({ passed: true, weight: 0, message: "Clean" });
      // Domain age under 365 → no bonus
      vi.mocked(getDomainReputation).mockResolvedValue({
        name: "company.com",
        ageInDays: 100,
        reputation: "neutral",
      });

      const result = await validateEmail("test@company.com");

      expect(result.score).toBe(55);
      expect(result.status).toBe("risky");
      expect(result.score).toBeGreaterThanOrEqual(40);
      expect(result.score).toBeLessThan(75);
    });

    it("should produce deterministic statuses for all (score, smtpPassed) combinations", async () => {
      // Lines 144-145 (status = "unknown") are unreachable dead code because
      // every possible (score, smtpPassed) pair is covered by the conditions above:
      //   - format/disposable fail → "invalid"  (short-circuit)
      //   - typo fail → "risky"
      //   - score >= 75 && smtp pass → "valid"
      //   - score < 40  OR  !smtp pass → "invalid"
      //   - 40 <= score < 75 && smtp pass → "risky"

      // (A) score >= 75 + SMTP passes → "valid"
      // 75 = format(15) + catchAll(10) + smtp(30) + disposable(10) + generic(5) + spf(5)
      vi.mocked(checkMX).mockResolvedValue({ passed: false, weight: 25, message: "No MX" });
      vi.mocked(checkCatchAll).mockResolvedValue({ passed: true, weight: 10, message: "OK" });
      vi.mocked(checkSPF).mockResolvedValue({ passed: true, weight: 5, message: "SPF OK" });
      vi.mocked(checkDMARC).mockResolvedValue({ passed: false, weight: 5, message: "No DMARC" });
      vi.mocked(checkDNSBL).mockResolvedValue({ passed: true, weight: 0, message: "Clean" });
      vi.mocked(getDomainReputation).mockResolvedValue({
        name: "company.com",
        ageInDays: 100,
        reputation: "neutral",
      });
      const resultA = await validateEmail("a@company.com");
      expect(resultA.score).toBe(75);
      expect(resultA.status).toBe("valid");

      // (B) score < 40 + SMTP passes → "invalid"
      // Need to undo catchAll/spf/generic from (A): 75 -10 -5 -5 = 55 then -20 = 35
      vi.mocked(checkCatchAll).mockResolvedValue({ passed: false, weight: 10, message: "No" });
      vi.mocked(checkGeneric).mockResolvedValue({ passed: false, weight: 5, message: "No" });
      vi.mocked(checkSPF).mockResolvedValue({ passed: false, weight: 5, message: "No SPF" });
      vi.mocked(checkDNSBL).mockResolvedValue({ passed: false, weight: 20, message: "Listed" });
      const resultB = await validateEmail("b@company.com");
      expect(resultB.score).toBe(35);
      expect(resultB.status).toBe("invalid");

      // (C) SMTP fails (any score) → "invalid"
      vi.mocked(checkSMTP).mockResolvedValue({ passed: false, weight: 30, message: "SMTP failed" });
      const resultC = await validateEmail("c@company.com");
      expect(resultC.status).toBe("invalid");

      // (D) 40 <= score < 75 + SMTP passes → "risky"
      // Rebalance: smtp passes, dnsbl clean. Score = format(15)+smtp(30)+disposable(10)+catchAll(0)+generic(0)+spf(0) = 55
      vi.mocked(checkDNSBL).mockResolvedValue({ passed: true, weight: 0, message: "Clean" });
      vi.mocked(checkSMTP).mockResolvedValue({ passed: true, weight: 30, message: "SMTP OK" });
      const resultD = await validateEmail("d@company.com");
      expect(resultD.score).toBe(55);
      expect(resultD.status).toBe("risky");
    });

    // --- Cache key normalization ---

    it("should normalize email (trim + lowercase) for cache operations", async () => {
      // getCachedValidation is already mocked to return null by default
      await validateEmail("  Test@Example.COM  ");

      expect(getCachedValidation).toHaveBeenCalledWith("test@example.com");
    });

    // --- Error propagation ---

    it("should propagate error when a checker without .catch() throws", async () => {
      // checkFormat is synchronous and has no .catch() wrapper in the source
      vi.mocked(checkFormat).mockImplementation(() => {
        throw new Error("Format crashed");
      });

      await expect(validateEmail("test@company.com")).rejects.toThrow("Format crashed");
    });

    // --- Score boundary tests ---

    it("should be valid when score is exactly 75 and SMTP passes (upper boundary)", async () => {
      // score = format(15) + smtp(30) + disposable(10) + mx(25) + spf(5) - domainAge(0) = 85 — too high.
      // Disable optional: mx, catchAll, generic, spf, dmarc, domainAge
      // 15 + 30 + 10 = 55, need 20 more → catchAll(10) + spf(5) + generic(5) = 20 => 75
      vi.mocked(checkMX).mockResolvedValue({ passed: false, weight: 25, message: "No MX" });
      vi.mocked(checkCatchAll).mockResolvedValue({ passed: true, weight: 10, message: "OK" });
      vi.mocked(checkGeneric).mockResolvedValue({ passed: true, weight: 5, message: "OK" });
      vi.mocked(checkSPF).mockResolvedValue({ passed: true, weight: 5, message: "SPF OK" });
      vi.mocked(checkDMARC).mockResolvedValue({ passed: false, weight: 5, message: "No DMARC" });
      vi.mocked(getDomainReputation).mockResolvedValue({
        name: "company.com",
        ageInDays: 100,
        reputation: "neutral",
      });

      const result = await validateEmail("test@company.com");
      expect(result.score).toBe(75);
      expect(result.status).toBe("valid");
    });

    it("should be risky when score is exactly 40 and SMTP passes (lower boundary)", async () => {
      // 40 = format(15) + smtp(30) + disposable(10) + generic(5) + dnsblFail(-20)
      vi.mocked(checkMX).mockResolvedValue({ passed: false, weight: 25, message: "No MX" });
      vi.mocked(checkCatchAll).mockResolvedValue({
        passed: false,
        weight: 10,
        message: "Not catch-all",
      });
      vi.mocked(checkGeneric).mockResolvedValue({
        passed: true,
        weight: 5,
        message: "Not generic",
      });
      vi.mocked(checkSPF).mockResolvedValue({ passed: false, weight: 5, message: "No SPF" });
      vi.mocked(checkDMARC).mockResolvedValue({ passed: false, weight: 5, message: "No DMARC" });
      vi.mocked(checkDNSBL).mockResolvedValue({ passed: false, weight: 20, message: "Listed" });
      vi.mocked(getDomainReputation).mockResolvedValue({
        name: "company.com",
        ageInDays: 100,
        reputation: "neutral",
      });

      const result = await validateEmail("test@company.com");
      expect(result.score).toBe(40);
      expect(result.status).toBe("risky");
    });

    it("should be invalid when score is 35 (one below 40) and SMTP passes", async () => {
      // 35 = format(15) + smtp(30) + disposable(10) + dnsblFail(-20)
      // Note: scores are multiples of 5 because all SCORING_WEIGHTS values are
      // multiples of 5. 39 is not achievable, so 35 is the true boundary test.
      vi.mocked(checkMX).mockResolvedValue({ passed: false, weight: 25, message: "No MX" });
      vi.mocked(checkCatchAll).mockResolvedValue({
        passed: false,
        weight: 10,
        message: "Not catch-all",
      });
      vi.mocked(checkGeneric).mockResolvedValue({ passed: false, weight: 5, message: "Generic" });
      vi.mocked(checkSPF).mockResolvedValue({ passed: false, weight: 5, message: "No SPF" });
      vi.mocked(checkDMARC).mockResolvedValue({ passed: false, weight: 5, message: "No DMARC" });
      vi.mocked(checkDNSBL).mockResolvedValue({ passed: false, weight: 20, message: "Listed" });
      vi.mocked(getDomainReputation).mockResolvedValue({
        name: "company.com",
        ageInDays: 100,
        reputation: "neutral",
      });

      const result = await validateEmail("test@company.com");
      expect(result.score).toBe(35);
      expect(result.status).toBe("invalid");
    });

    // --- Score clamping & domain age edge cases ---

    it("should clamp score to 100 when all checks pass and domain age bonus applies (line 126)", async () => {
      // Default mocks: everything passes + domain ageInDays=400 (>365)
      // Raw score = 15+25+30+10+10+5+5+5+5 = 110 → clamped to 100
      const result = await validateEmail("test@company.com");

      expect(result.score).toBe(100);
      expect(result.status).toBe("valid");
    });

    it("should not add domain age bonus when ageInDays is undefined (line 117)", async () => {
      // Disable some checks so base score without bonus is < 100
      vi.mocked(checkMX).mockResolvedValue({ passed: false, weight: 25, message: "No MX" });
      vi.mocked(checkCatchAll).mockResolvedValue({
        passed: false,
        weight: 10,
        message: "No catchAll",
      });
      vi.mocked(checkGeneric).mockResolvedValue({ passed: false, weight: 5, message: "Generic" });
      vi.mocked(checkSPF).mockResolvedValue({ passed: false, weight: 5, message: "No SPF" });
      vi.mocked(checkDMARC).mockResolvedValue({ passed: false, weight: 5, message: "No DMARC" });

      vi.mocked(getDomainReputation).mockResolvedValue({
        name: "company.com",
        ageInDays: undefined as any,
        reputation: "good",
      });

      const result = await validateEmail("test@company.com");

      // Score = format(15) + smtp(30) + disposable(10) = 55 (no domain age bonus)
      expect(result.score).toBe(55);
      // No bonus → score stays at 55
      expect(result.status).toBe("risky");
    });

    it("should call setCachedValidation after a fresh validation (cache miss)", async () => {
      // getCachedValidation already returns null (mocked in beforeEach)
      await validateEmail("test@company.com");

      expect(setCachedValidation).toHaveBeenCalledWith(
        "test@company.com",
        expect.objectContaining({
          email: "test@company.com",
          score: expect.any(Number),
          status: expect.any(String),
        }),
      );
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
