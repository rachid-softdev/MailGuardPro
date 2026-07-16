import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRedisGet, mockRedisSetex } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSetex: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  redis: { get: mockRedisGet, setex: mockRedisSetex },
}));

import { getDomainAge, getDomainReputation } from "@/services/reputationScorer";

describe("reputationScorer — RDAP parsing (P1-15)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSetex.mockResolvedValue("OK");
    globalThis.fetch = vi.fn();
  });

  it("should parse a real RDAP 'registration' event into ageInDays", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          events: [{ eventAction: "registration", eventDate: "2008-01-01T00:00:00Z" }],
        }),
    });
    const result = await getDomainAge("rdap-test.xyz");
    expect(result.createdAt).toBe("2008-01-01T00:00:00Z");
    expect(result.ageInDays).toBeGreaterThan(5000);
  });

  it("should fall back to ageInDays:365 when only a handle is present", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ handle: "DOMAIN-123", status: "active" }),
    });
    const result = await getDomainAge("rdap-handle.xyz");
    expect(result.createdAt).toBeUndefined();
    expect(result.ageInDays).toBe(365);
  });

  it("should return {} when RDAP json() throws", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error("bad json")),
    });
    const result = await getDomainAge("rdap-bad.xyz");
    expect(result).toEqual({});
  });
});

describe("reputationScorer — age brackets & category boundaries (P1-23/24)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisSetex.mockResolvedValue("OK");
  });

  async function reputationFor(ageInDays: number): Promise<"good" | "neutral" | "poor"> {
    mockRedisGet.mockImplementation((k: string) =>
      k.includes("domain_age")
        ? Promise.resolve(JSON.stringify({ ageInDays }))
        : Promise.resolve(null),
    );
    return (await getDomainReputation("bracket.xyz")).reputation;
  }

  it("age 1826d (5y+) -> good (+25)", async () => {
    expect(await reputationFor(1826)).toBe("good");
  });
  it("age 731d -> good (+15 >=65)", async () => {
    expect(await reputationFor(731)).toBe("good");
  });
  it("age 730d -> neutral (+5, score 55)", async () => {
    expect(await reputationFor(730)).toBe("neutral");
  });
  it("age 400d -> neutral (+5)", async () => {
    expect(await reputationFor(400)).toBe("neutral");
  });
  it("age 90d -> neutral (-5, score 45)", async () => {
    expect(await reputationFor(90)).toBe("neutral");
  });
  it("age 89d -> poor (-15, score 35)", async () => {
    expect(await reputationFor(89)).toBe("poor");
  });
  it("age 15d -> poor (-30)", async () => {
    expect(await reputationFor(15)).toBe("poor");
  });
});
