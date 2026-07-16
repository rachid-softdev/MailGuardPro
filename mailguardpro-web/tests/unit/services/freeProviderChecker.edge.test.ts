import { describe, expect, it, vi } from "vitest";
import { checkGeneric } from "@/services/genericChecker";
import { checkFreeProvider } from "@/services/freeProviderChecker";

describe("genericChecker / freeProviderChecker — edge cases", () => {
  it("freeProviderChecker: multi-@ email does not throw and is treated as custom (passed:true)", () => {
    const result = checkFreeProvider("a@b@c");
    expect(result.passed).toBe(true);
    expect(result.message).toBe("Email professionnel");
  });

  it("freeProviderChecker: numeric-prefixed local part is not generic (passed:true)", () => {
    const result = checkFreeProvider("123support@company.com");
    expect(result.passed).toBe(true);
  });

  it("genericChecker: multi-@ email does not throw", () => {
    const result = checkGeneric("info@b@c.com");
    expect(result).toHaveProperty("passed");
  });

  it("genericChecker: numeric-prefixed local part is not matched as generic", () => {
    const result = checkGeneric("123support@company.com");
    expect(result.passed).toBe(true);
  });
});
