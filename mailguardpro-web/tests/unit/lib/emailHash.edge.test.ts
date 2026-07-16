import { describe, expect, it } from "vitest";
import { hashEmail, maskEmail } from "@/lib/emailHash";

describe("emailHash.maskEmail edge cases (P1)", () => {
  it("masks the local part and preserves the domain for a normal email", () => {
    expect(maskEmail("john.doe@example.com")).toBe("j***@example.com");
  });

  it("handles a single-character local part", () => {
    expect(maskEmail("a@example.com")).toBe("a***@example.com");
  });

  it("does NOT produce 'undefined' for an email without an @ (P1 guard)", () => {
    expect(maskEmail("localonly")).toBe("l***");
  });

  it("handles multiple dots in the domain", () => {
    expect(maskEmail("j@mail.example.co.uk")).toBe("j***@mail.example.co.uk");
  });
});

describe("emailHash.hashEmail (regression)", () => {
  it("returns a 64-char hex string and is deterministic", () => {
    const a = hashEmail("User@Example.com");
    const b = hashEmail("user@example.com");
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).toBe(b);
  });
});
