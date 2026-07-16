import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRedisGet, mockRedisSetex, mockResolve4, mockValidateIp, mockLookup } = vi.hoisted(
  () => ({
    mockRedisGet: vi.fn(),
    mockRedisSetex: vi.fn(),
    mockResolve4: vi.fn(),
    mockValidateIp: vi.fn(),
    mockLookup: vi.fn(),
  }),
);

vi.mock("@/lib/redis", () => ({
  redis: { get: mockRedisGet, setex: mockRedisSetex },
}));

vi.mock("dns/promises", () => ({
  __esModule: true,
  default: { resolve4: mockResolve4 },
  resolve4: mockResolve4,
}));

vi.mock("@/lib/ssrf", () => ({
  validateResolvedIp: mockValidateIp,
}));

vi.mock("whois", () => ({
  lookup: mockLookup,
}));

import { getDomainAge } from "@/services/reputationScorer";

describe("reputationScorer — WHOIS parsing (P2-30)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSetex.mockResolvedValue("OK");
    mockValidateIp.mockReturnValue({ valid: true });
    // Force RDAP down so the WHOIS branch is exercised
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
  });

  it("should parse a WHOIS 'Creation Date' line when RDAP fails", async () => {
    mockResolve4.mockResolvedValue(["1.2.3.4"]);
    mockLookup.mockImplementation((_d: string, _o: any, cb: any) =>
      cb(null, "Domain Name: example.xyz\nCreation Date: 2010-05-01T00:00:00Z\nRegistrar: TEST"),
    );
    const result = await getDomainAge("example.xyz");
    expect(result.createdAt).toBe("2010-05-01T00:00:00Z");
    expect(result.ageInDays).toBeGreaterThan(5000);
  });

  it("should skip WHOIS when domain resolves to a blocked IP", async () => {
    mockResolve4.mockResolvedValue(["10.0.0.1"]);
    mockValidateIp.mockReturnValue({ valid: false });
    const result = await getDomainAge("blocked.xyz");
    expect(result).toEqual({});
  });

  it("should skip WHOIS (return {}) when domain does not resolve (NXDOMAIN)", async () => {
    mockResolve4.mockResolvedValue(null);
    const result = await getDomainAge("nope.xyz");
    expect(result).toEqual({});
  });
});
