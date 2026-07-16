import type { CheckResult, ValidationResult } from "@mailguardpro/types";
import { describe, expect, it } from "vitest";

describe("types deduplication", () => {
  it("CheckResult should accept optional weight", () => {
    const check: CheckResult = { passed: true, message: "test" };
    expect(check.passed).toBe(true);
    expect(check.message).toBe("test");
    expect(check.weight).toBeUndefined();

    const check2: CheckResult = { passed: true, message: "test", weight: 15 };
    expect(check2.weight).toBe(15);
  });

  it("ValidationResult should include algoVersion", () => {
    const result: ValidationResult = {
      email: "test@example.com",
      score: 85,
      status: "valid",
      checks: {
        format: { passed: true, message: "OK" },
        mx: { passed: true, message: "OK" },
        smtp: { passed: true, message: "OK" },
        catchAll: { passed: true, message: "OK" },
        disposable: { passed: true, message: "OK" },
        generic: { passed: true, message: "OK" },
        freeProvider: { passed: true, message: "OK" },
        dnsbl: { passed: true, message: "OK" },
        spf: { passed: true, message: "OK" },
        dmarc: { passed: true, message: "OK" },
        typo: { passed: true, message: "OK" },
      },
      domain: { name: "example.com", reputation: "good" },
      processingTimeMs: 150,
      algoVersion: 2,
    };
    expect(result.algoVersion).toBe(2);
  });

  it("types from @mailguardpro/types should be assignable to service usage", () => {
    const check: CheckResult = { passed: false, message: "invalid" };
    const results: ValidationResult[] = [
      {
        email: "a@b.com",
        score: 100,
        status: "valid",
        checks: {
          format: check,
          mx: check,
          smtp: check,
          catchAll: check,
          disposable: check,
          generic: check,
          freeProvider: check,
          dnsbl: check,
          spf: check,
          dmarc: check,
          typo: check,
        },
        domain: { name: "b.com", reputation: "good" },
        processingTimeMs: 50,
        algoVersion: 1,
      },
    ];
    expect(results).toHaveLength(1);
    expect(results[0].algoVersion).toBe(1);
  });
});
