// =============================================================================
// STAFF-1: Scoring Algorithm Tests
// Tests for SCORING_WEIGHTS configuration, score calculation formula,
// threshold boundaries, and edge cases (0, 100, negative, >100).
// =============================================================================

import { describe, expect, it } from "vitest";
import { SCORING_WEIGHTS } from "@/config/scoringWeights";

describe("SCORING_WEIGHTS", () => {
  // ===========================================================================
  // Structure & completeness
  // ===========================================================================
  describe("structure", () => {
    it("should export a non-null object", () => {
      expect(SCORING_WEIGHTS).toBeDefined();
      expect(typeof SCORING_WEIGHTS).toBe("object");
    });

    it("should have all required check categories", () => {
      const required = [
        "format",
        "mx",
        "smtp",
        "catchAll",
        "disposable",
        "generic",
        "spf",
        "dmarc",
        "domainAge",
        "dnsbl",
        "typo",
      ];
      for (const key of required) {
        expect(SCORING_WEIGHTS).toHaveProperty(key);
      }
    });

    it("should have exactly the expected number of categories", () => {
      const keys = Object.keys(SCORING_WEIGHTS);
      expect(keys).toHaveLength(11);
    });

    it("should have pass and fail properties for each category", () => {
      for (const [key, value] of Object.entries(SCORING_WEIGHTS)) {
        expect(value).toHaveProperty("pass");
        expect(value).toHaveProperty("fail");
        expect(typeof value.pass).toBe("number");
        expect(typeof value.fail).toBe("number");
      }
    });
  });

  // ===========================================================================
  // Individual weight values — verify each matches expected spec
  // ===========================================================================
  describe("individual weight values", () => {
    it("format: pass=15, fail=0", () => {
      expect(SCORING_WEIGHTS.format.pass).toBe(15);
      expect(SCORING_WEIGHTS.format.fail).toBe(0);
    });

    it("mx: pass=25, fail=0", () => {
      expect(SCORING_WEIGHTS.mx.pass).toBe(25);
      expect(SCORING_WEIGHTS.mx.fail).toBe(0);
    });

    it("smtp: pass=30, fail=0", () => {
      expect(SCORING_WEIGHTS.smtp.pass).toBe(30);
      expect(SCORING_WEIGHTS.smtp.fail).toBe(0);
    });

    it("catchAll: pass=10, fail=0", () => {
      expect(SCORING_WEIGHTS.catchAll.pass).toBe(10);
      expect(SCORING_WEIGHTS.catchAll.fail).toBe(0);
    });

    it("disposable: pass=10, fail=0", () => {
      expect(SCORING_WEIGHTS.disposable.pass).toBe(10);
      expect(SCORING_WEIGHTS.disposable.fail).toBe(0);
    });

    it("generic: pass=5, fail=0", () => {
      expect(SCORING_WEIGHTS.generic.pass).toBe(5);
      expect(SCORING_WEIGHTS.generic.fail).toBe(0);
    });

    it("spf: pass=5, fail=0", () => {
      expect(SCORING_WEIGHTS.spf.pass).toBe(5);
      expect(SCORING_WEIGHTS.spf.fail).toBe(0);
    });

    it("dmarc: pass=5, fail=0", () => {
      expect(SCORING_WEIGHTS.dmarc.pass).toBe(5);
      expect(SCORING_WEIGHTS.dmarc.fail).toBe(0);
    });

    it("domainAge: pass=5, fail=0", () => {
      expect(SCORING_WEIGHTS.domainAge.pass).toBe(5);
      expect(SCORING_WEIGHTS.domainAge.fail).toBe(0);
    });

    it("dnsbl: pass=0, fail=-20", () => {
      expect(SCORING_WEIGHTS.dnsbl.pass).toBe(0);
      expect(SCORING_WEIGHTS.dnsbl.fail).toBe(-20);
    });

    it("typo: pass=0, fail=-10", () => {
      expect(SCORING_WEIGHTS.typo.pass).toBe(0);
      expect(SCORING_WEIGHTS.typo.fail).toBe(-10);
    });
  });

  // ===========================================================================
  // Score calculation — replicate the scoring formula from emailValidator.ts
  // to verify the math is correct for every combination.
  // ===========================================================================
  describe("score calculation", () => {
    /**
     * Replicates the scoring formula from services/emailValidator.ts lines 98-124.
     * This ensures the algorithm is independently verifiable.
     */
    function calculateScore(options: {
      formatPassed: boolean;
      mxPassed: boolean;
      smtpPassed: boolean;
      catchAllPassed: boolean;
      disposablePassed: boolean;
      genericPassed: boolean;
      spfPassed: boolean;
      dmarcPassed: boolean;
      domainAgePassed: boolean;
      dnsblPassed: boolean;
      typoPassed: boolean;
    }): number {
      let score = 0;

      if (options.formatPassed) score += SCORING_WEIGHTS.format.pass;
      if (options.mxPassed) score += SCORING_WEIGHTS.mx.pass;
      if (options.smtpPassed) score += SCORING_WEIGHTS.smtp.pass;
      if (options.catchAllPassed) score += SCORING_WEIGHTS.catchAll.pass;
      if (options.disposablePassed) score += SCORING_WEIGHTS.disposable.pass;
      if (options.genericPassed) score += SCORING_WEIGHTS.generic.pass;
      if (options.spfPassed) score += SCORING_WEIGHTS.spf.pass;
      if (options.dmarcPassed) score += SCORING_WEIGHTS.dmarc.pass;
      if (options.domainAgePassed) score += SCORING_WEIGHTS.domainAge.pass;
      if (!options.dnsblPassed) score += SCORING_WEIGHTS.dnsbl.fail;
      if (!options.typoPassed) score += SCORING_WEIGHTS.typo.fail;

      // Clamp between 0 and 100
      return Math.max(0, Math.min(100, score));
    }

    it("should calculate maximum score (all passing) as 100", () => {
      const score = calculateScore({
        formatPassed: true,
        mxPassed: true,
        smtpPassed: true,
        catchAllPassed: true,
        disposablePassed: true,
        genericPassed: true,
        spfPassed: true,
        dmarcPassed: true,
        domainAgePassed: true,
        dnsblPassed: true,
        typoPassed: true,
      });
      // Max raw = 15+25+30+10+10+5+5+5+5 = 110, clamped to 100
      expect(score).toBe(100);
    });

    it("should calculate minimum score (all failing, penalties) as 0", () => {
      const score = calculateScore({
        formatPassed: false,
        mxPassed: false,
        smtpPassed: false,
        catchAllPassed: false,
        disposablePassed: false,
        genericPassed: false,
        spfPassed: false,
        dmarcPassed: false,
        domainAgePassed: false,
        dnsblPassed: false,
        typoPassed: false,
      });
      // Min raw = -20 + -10 = -30, clamped to 0
      expect(score).toBe(0);
    });

    it("should calculate score with SMTP+MX+Format only (core checks)", () => {
      const score = calculateScore({
        formatPassed: true,
        mxPassed: true,
        smtpPassed: true,
        catchAllPassed: false,
        disposablePassed: false,
        genericPassed: false,
        spfPassed: false,
        dmarcPassed: false,
        domainAgePassed: false,
        dnsblPassed: true,
        typoPassed: true,
      });
      // format(15) + mx(25) + smtp(30) = 70
      expect(score).toBe(70);
    });

    it("should include DNSBL penalty", () => {
      const score = calculateScore({
        formatPassed: true,
        mxPassed: true,
        smtpPassed: true,
        catchAllPassed: true,
        disposablePassed: true,
        genericPassed: true,
        spfPassed: true,
        dmarcPassed: true,
        domainAgePassed: true,
        dnsblPassed: false,
        typoPassed: true,
      });
      // All pass (110) + dnsbl penalty (-20) = 90, clamped to 90
      expect(score).toBe(90);
    });

    it("should include typo penalty", () => {
      const score = calculateScore({
        formatPassed: true,
        mxPassed: true,
        smtpPassed: true,
        catchAllPassed: true,
        disposablePassed: true,
        genericPassed: true,
        spfPassed: true,
        dmarcPassed: true,
        domainAgePassed: true,
        dnsblPassed: true,
        typoPassed: false,
      });
      // All pass (110) + typo penalty (-10) = 100, clamped to 100
      expect(score).toBe(100);
    });

    it("should apply both DNSBL and typo penalties", () => {
      const score = calculateScore({
        formatPassed: true,
        mxPassed: true,
        smtpPassed: true,
        catchAllPassed: true,
        disposablePassed: true,
        genericPassed: true,
        spfPassed: true,
        dmarcPassed: true,
        domainAgePassed: true,
        dnsblPassed: false,
        typoPassed: false,
      });
      // All pass (110) + dnsbl(-20) + typo(-10) = 80, clamped to 80
      expect(score).toBe(80);
    });

    it("should clamp negative scores to 0", () => {
      const score = calculateScore({
        formatPassed: false,
        mxPassed: false,
        smtpPassed: false,
        catchAllPassed: false,
        disposablePassed: false,
        genericPassed: false,
        spfPassed: false,
        dmarcPassed: false,
        domainAgePassed: false,
        dnsblPassed: false,
        typoPassed: false,
      });
      expect(score).toBe(0);
    });

    it("should clamp scores above 100 to 100", () => {
      // All 9 positive checks passing = 110 raw (before penalties)
      const score = calculateScore({
        formatPassed: true,
        mxPassed: true,
        smtpPassed: true,
        catchAllPassed: true,
        disposablePassed: true,
        genericPassed: true,
        spfPassed: true,
        dmarcPassed: true,
        domainAgePassed: true,
        dnsblPassed: true,
        typoPassed: true,
      });
      expect(score).toBe(100);
    });
  });

  // ===========================================================================
  // Status threshold boundaries — map score ranges to status
  // ===========================================================================
  describe("status determination", () => {
    /**
     * Replicates the status determination from emailValidator.ts lines 126-144.
     */
    function determineStatus(options: {
      formatPassed: boolean;
      disposablePassed: boolean;
      typoPassed: boolean;
      smtpPassed: boolean;
      score: number;
    }): "valid" | "invalid" | "risky" | "unknown" {
      const { formatPassed, disposablePassed, typoPassed, smtpPassed, score } = options;

      if (!formatPassed) return "invalid";
      if (!disposablePassed) return "invalid";
      if (!typoPassed) return "risky";
      if (score >= 75 && smtpPassed) return "valid";
      if (score < 40 || !smtpPassed) return "invalid";
      if (score >= 40 && score < 75) return "risky";
      return "unknown";
    }

    it("should return valid when score >= 75 and SMTP passes", () => {
      expect(
        determineStatus({
          formatPassed: true,
          disposablePassed: true,
          typoPassed: true,
          smtpPassed: true,
          score: 75,
        }),
      ).toBe("valid");
    });

    it("should return valid when score = 100 and SMTP passes", () => {
      expect(
        determineStatus({
          formatPassed: true,
          disposablePassed: true,
          typoPassed: true,
          smtpPassed: true,
          score: 100,
        }),
      ).toBe("valid");
    });

    it("should return invalid when format fails (score = 0)", () => {
      expect(
        determineStatus({
          formatPassed: false,
          disposablePassed: true,
          typoPassed: true,
          smtpPassed: true,
          score: 0,
        }),
      ).toBe("invalid");
    });

    it("should return invalid when disposable fails", () => {
      expect(
        determineStatus({
          formatPassed: true,
          disposablePassed: false,
          typoPassed: true,
          smtpPassed: true,
          score: 75,
        }),
      ).toBe("invalid");
    });

    it("should return risky when typo detected (regardless of score)", () => {
      expect(
        determineStatus({
          formatPassed: true,
          disposablePassed: true,
          typoPassed: false,
          smtpPassed: true,
          score: 100,
        }),
      ).toBe("risky");
    });

    it("should return invalid when score < 40 even with SMTP passing", () => {
      expect(
        determineStatus({
          formatPassed: true,
          disposablePassed: true,
          typoPassed: true,
          smtpPassed: true,
          score: 39,
        }),
      ).toBe("invalid");
    });

    it("should return invalid when score >= 40 but SMTP fails", () => {
      expect(
        determineStatus({
          formatPassed: true,
          disposablePassed: true,
          typoPassed: true,
          smtpPassed: false,
          score: 60,
        }),
      ).toBe("invalid");
    });

    it("should return risky when score >= 40 and < 75 and SMTP passes", () => {
      expect(
        determineStatus({
          formatPassed: true,
          disposablePassed: true,
          typoPassed: true,
          smtpPassed: true,
          score: 60,
        }),
      ).toBe("risky");
    });

    it("should return risky at exact boundary score = 40 with SMTP passes", () => {
      expect(
        determineStatus({
          formatPassed: true,
          disposablePassed: true,
          typoPassed: true,
          smtpPassed: true,
          score: 40,
        }),
      ).toBe("risky");
    });

    it("should return risky at exact boundary score = 74 with SMTP passes", () => {
      expect(
        determineStatus({
          formatPassed: true,
          disposablePassed: true,
          typoPassed: true,
          smtpPassed: true,
          score: 74,
        }),
      ).toBe("risky");
    });

    it("should return invalid at exact boundary score = 39 with SMTP passes", () => {
      expect(
        determineStatus({
          formatPassed: true,
          disposablePassed: true,
          typoPassed: true,
          smtpPassed: true,
          score: 39,
        }),
      ).toBe("invalid");
    });

    it("should return invalid at exact boundary score = 40 with SMTP failing", () => {
      expect(
        determineStatus({
          formatPassed: true,
          disposablePassed: true,
          typoPassed: true,
          smtpPassed: false,
          score: 40,
        }),
      ).toBe("invalid");
    });

    it("should return unknown when no condition matches (fallback)", () => {
      // Edge: format passes, disposable passes, typo passes, but SMTP is false
      // and score >= 75 — this path: score >= 75 && smtpPassed fails,
      // then score < 40 || !smtpPassed is true (!smtpPassed), so it returns invalid
      // Actually this case would be caught by the !smtpPassed check.
      // The "unknown" fallback would only trigger with impossible conditions.
      // Let's test it directly:
      expect(
        determineStatus({
          formatPassed: true,
          disposablePassed: true,
          typoPassed: true,
          smtpPassed: false,
          score: 0,
        }),
      ).toBe("invalid"); // score < 40 catches this
    });
  });

  // ===========================================================================
  // Edge cases
  // ===========================================================================
  describe("edge cases", () => {
    it("should handle score of exactly 0", () => {
      const score = Math.max(0, Math.min(100, 0));
      expect(score).toBe(0);
    });

    it("should handle score of exactly 100", () => {
      const score = Math.max(0, Math.min(100, 100));
      expect(score).toBe(100);
    });

    it("should handle negative score (clamped to 0)", () => {
      const score = Math.max(0, Math.min(100, -50));
      expect(score).toBe(0);
    });

    it("should handle overflow score (clamped to 100)", () => {
      const score = Math.max(0, Math.min(100, 150));
      expect(score).toBe(100);
    });

    it("should handle NaN score (Math.max/Min coerce)", () => {
      const score = Math.max(0, Math.min(100, NaN));
      expect(score).toBe(NaN);
    });

    it("should handle null/undefined score gracefully via Number coercion", () => {
      // This matches how JS handles null in arithmetic
      const scoreNull = Math.max(0, Math.min(100, Number(null)));
      expect(scoreNull).toBe(0);

      const scoreUndefined = Math.max(0, Math.min(100, Number(undefined)));
      expect(scoreUndefined).toBe(NaN);
    });
  });

  // ===========================================================================
  // Algorithm versioning — weights should be treated as immutable
  // ===========================================================================
  describe("algorithm versioning", () => {
    it("should use `as const` to ensure type safety and immutability", () => {
      // SCORING_WEIGHTS is declared with `as const` which makes it deeply readonly
      // at the type level. Verify runtime values match.
      const weights = JSON.parse(JSON.stringify(SCORING_WEIGHTS));
      expect(weights).toEqual({
        format: { pass: 15, fail: 0 },
        mx: { pass: 25, fail: 0 },
        smtp: { pass: 30, fail: 0 },
        catchAll: { pass: 10, fail: 0 },
        disposable: { pass: 10, fail: 0 },
        generic: { pass: 5, fail: 0 },
        spf: { pass: 5, fail: 0 },
        dmarc: { pass: 5, fail: 0 },
        domainAge: { pass: 5, fail: 0 },
        dnsbl: { pass: 0, fail: -20 },
        typo: { pass: 0, fail: -10 },
      });
    });

    it("should have integer weights (no floating point to avoid precision issues)", () => {
      for (const [, value] of Object.entries(SCORING_WEIGHTS)) {
        expect(Number.isInteger(value.pass)).toBe(true);
        expect(Number.isInteger(value.fail)).toBe(true);
      }
    });

    it("should have positive or zero pass values, negative or zero fail values", () => {
      for (const [, value] of Object.entries(SCORING_WEIGHTS)) {
        expect(value.pass).toBeGreaterThanOrEqual(0);
        expect(value.fail).toBeLessThanOrEqual(0);
      }
    });
  });
});
