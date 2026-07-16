import { describe, expect, it, vi } from "vitest";
import { checkFormat } from "@/services/formatChecker";

describe("formatChecker — edge cases", () => {
  it("should reject domain label longer than 63 chars (Domaine trop long)", () => {
    // domain = "a".repeat(64) + ".com" => length 68 > 63, total 70 <= 254
    const domain = "a".repeat(64) + ".com";
    const result = checkFormat(`user@${domain}`);
    expect(result.passed).toBe(false);
    expect(result.message).toBe("Domaine trop long");
  });

  it("should reject email with multiple @ signs (Format invalide)", () => {
    const result = checkFormat("user@domain@invalid.com");
    expect(result.passed).toBe(false);
    expect(result.message).toBe("Format invalide");
  });

  it("should reject email with three @ signs (Format invalide)", () => {
    const result = checkFormat("a@b@c@d.com");
    expect(result.passed).toBe(false);
    expect(result.message).toBe("Format invalide");
  });

  it("should reject whitespace-only email (Format invalide)", () => {
    const result = checkFormat("   ");
    expect(result.passed).toBe(false);
    expect(result.message).toBe("Format invalide");
  });

  it("should still reject a 254-char boundary correctly handled", () => {
    // exactly 254 chars total => passes length check
    const longEmail = "a".repeat(253) + "@b.com"; // 253 + 1 + 5 = 259 > 254
    const r1 = checkFormat(longEmail);
    expect(r1.passed).toBe(false);
    expect(r1.message).toBe("Email trop long");

    // at exactly 254 it should not trip the length branch
    const exact = "a".repeat(245) + "@b.com"; // 245 + 1 + 5 = 251 <= 254
    const r2 = checkFormat(exact);
    expect(r2).toHaveProperty("passed");
  });
});
