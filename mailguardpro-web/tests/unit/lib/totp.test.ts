// Unit tests for lib/totp.ts — TOTP (RFC 6238), base32 (RFC 4648) and
// recovery code primitives.

import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  buildOtpAuthUri,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  normalizeRecoveryCode,
  parseStoredRecoveryCodeHashes,
  totpCode,
  verifyTotp,
} from "@/lib/totp";

const RFC_SECRET_ASCII = "12345678901234567890";
const RFC_SECRET_BASE32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("base32 (RFC 4648)", () => {
  it("encodes the RFC 6238 reference secret to its known base32 form", () => {
    expect(base32Encode(Buffer.from(RFC_SECRET_ASCII))).toBe(RFC_SECRET_BASE32);
  });

  it("decodes the known base32 form back to the reference secret", () => {
    expect(base32Decode(RFC_SECRET_BASE32).toString()).toBe(RFC_SECRET_ASCII);
  });

  it("round-trips arbitrary bytes", () => {
    const bytes = Buffer.from([0x00, 0x01, 0x7f, 0x80, 0xff, 0x42]);
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
  });

  it("accepts lowercase, spaces and padding when decoding", () => {
    expect(base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq").toString()).toBe(
      RFC_SECRET_ASCII,
    );
    expect(base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ======").toString()).toBe(
      RFC_SECRET_ASCII,
    );
  });

  it("rejects empty strings and invalid characters", () => {
    expect(() => base32Decode("")).toThrow();
    expect(() => base32Decode("0189!")).toThrow();
  });
});

describe("totpCode (RFC 6238 SHA-1 vectors, truncated to 6 digits)", () => {
  const vectors: Array<[number, string]> = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ];

  for (const [unixSeconds, expected] of vectors) {
    it(`returns ${expected} at T=${unixSeconds}`, () => {
      expect(totpCode(RFC_SECRET_BASE32, unixSeconds * 1000)).toBe(expected);
    });
  }
});

describe("verifyTotp", () => {
  const nowMs = 1111111111 * 1000;

  it("accepts the current-step code", () => {
    expect(verifyTotp(RFC_SECRET_BASE32, totpCode(RFC_SECRET_BASE32, nowMs), { nowMs })).toBe(true);
  });

  it("accepts a code one step in the past and one step in the future (±1 drift)", () => {
    const past = totpCode(RFC_SECRET_BASE32, nowMs - 30_000);
    const future = totpCode(RFC_SECRET_BASE32, nowMs + 30_000);
    expect(verifyTotp(RFC_SECRET_BASE32, past, { nowMs })).toBe(true);
    expect(verifyTotp(RFC_SECRET_BASE32, future, { nowMs })).toBe(true);
  });

  it("rejects codes outside the drift window", () => {
    const tooOld = totpCode(RFC_SECRET_BASE32, nowMs - 90_000);
    const tooNew = totpCode(RFC_SECRET_BASE32, nowMs + 90_000);
    expect(verifyTotp(RFC_SECRET_BASE32, tooOld, { nowMs })).toBe(false);
    expect(verifyTotp(RFC_SECRET_BASE32, tooNew, { nowMs })).toBe(false);
  });

  it("rejects everything with window 0 except the exact current step", () => {
    const past = totpCode(RFC_SECRET_BASE32, nowMs - 30_000);
    expect(verifyTotp(RFC_SECRET_BASE32, past, { nowMs, window: 0 })).toBe(false);
    expect(
      verifyTotp(RFC_SECRET_BASE32, totpCode(RFC_SECRET_BASE32, nowMs), { nowMs, window: 0 }),
    ).toBe(true);
  });

  it("tolerates whitespace inside the submitted code", () => {
    const code = totpCode(RFC_SECRET_BASE32, nowMs);
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    expect(verifyTotp(RFC_SECRET_BASE32, spaced, { nowMs })).toBe(true);
  });

  it("rejects malformed codes without throwing", () => {
    for (const bad of ["", "12345", "1234567", "abcdef", "------"]) {
      expect(verifyTotp(RFC_SECRET_BASE32, bad, { nowMs })).toBe(false);
    }
  });
});

describe("generateTotpSecret", () => {
  it("returns a 160-bit secret as 32 base32 characters", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
  });

  it("generates distinct secrets", () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret());
  });
});

describe("recovery codes", () => {
  it("generates the requested number of unambiguous codes", () => {
    const codes = generateRecoveryCodes(10);
    expect(codes).toHaveLength(10);
    const format = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/;
    for (const code of codes) {
      expect(code).toMatch(format);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("normalizes case and separators", () => {
    expect(normalizeRecoveryCode("abcde-fghjk")).toBe("ABCDEFGHJK");
    expect(normalizeRecoveryCode("AbCdE fGhJk")).toBe("ABCDEFGHJK");
  });

  it("hashes codes case- and separator-insensitively", () => {
    expect(hashRecoveryCode("abcde-fghjk")).toBe(hashRecoveryCode("ABCDE FGHJK"));
    expect(hashRecoveryCode("abcde-fghjk")).not.toBe(hashRecoveryCode("abcde-fghjm"));
  });

  it("parses stored hash arrays defensively", () => {
    expect(parseStoredRecoveryCodeHashes(null)).toEqual([]);
    expect(parseStoredRecoveryCodeHashes("not-json")).toEqual([]);
    expect(parseStoredRecoveryCodeHashes('{"a":1}')).toEqual([]);
    expect(parseStoredRecoveryCodeHashes('["a", 1, "b"]')).toEqual(["a", "b"]);
  });
});

describe("buildOtpAuthUri", () => {
  it("builds a standards-compliant otpauth URI", () => {
    const uri = buildOtpAuthUri({ secret: RFC_SECRET_BASE32, account: "user@example.com" });
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain(encodeURIComponent("MailGuard Pro:user@example.com"));
    expect(uri).toContain(`secret=${RFC_SECRET_BASE32}`);
    expect(uri).toContain("issuer=MailGuard%20Pro");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });

  it("supports a custom issuer", () => {
    const uri = buildOtpAuthUri({ secret: "ABC", account: "a@b.c", issuer: "Custom App" });
    expect(uri).toContain(encodeURIComponent("Custom App:a@b.c"));
    expect(uri).toContain("issuer=Custom%20App");
  });
});
