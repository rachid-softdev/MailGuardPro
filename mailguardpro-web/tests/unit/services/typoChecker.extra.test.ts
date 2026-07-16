import { beforeEach, describe, expect, it, vi } from "vitest";

// Real Levenshtein (the global setup stub is a crude char-diff and is NOT applied here)
function realLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

const levImpl = vi.fn();

vi.mock("fast-levenshtein", () => ({
  __esModule: true,
  default: levImpl,
  get: levImpl,
  getEditDistance: levImpl,
}));

import { checkTypo } from "@/services/typoChecker";

describe("typoChecker — real Levenshtein fuzzy detection (P1-14)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    levImpl.mockImplementation(realLevenshtein);
  });

  it("should suggest mac.com for 'mac.co' (distance 1, not in commonTypos map)", async () => {
    const result = await checkTypo("user@mac.co");
    expect(result.passed).toBe(false);
    expect((result as any).suggestion).toBe("user@mac.com");
  });

  it("should suggest live.com for 'live.con' (distance 1)", async () => {
    const result = await checkTypo("user@live.con");
    expect(result.passed).toBe(false);
    expect((result as any).suggestion).toBe("user@live.com");
  });
});

describe("typoChecker — distance guard & failure (P2-29)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should NOT suggest when min distance to any popular domain is > 2", async () => {
    levImpl.mockImplementation(realLevenshtein);
    // mac.xyz is far from every popular domain
    let min = Infinity;
    const popular = [
      "gmail.com",
      "yahoo.com",
      "hotmail.com",
      "outlook.com",
      "live.com",
      "icloud.com",
      "aol.com",
      "mail.com",
      "protonmail.com",
      "zoho.com",
      "gmx.com",
      "gmx.net",
      "yandex.com",
      "fastmail.com",
      "tutanota.com",
      "me.com",
      "mac.com",
      "googlemail.com",
    ];
    for (const p of popular) min = Math.min(min, realLevenshtein("mac.xyz", p));
    expect(min).toBeGreaterThan(2);
    const result = await checkTypo("user@mac.xyz");
    expect(result.passed).toBe(true);
    expect(result).not.toHaveProperty("suggestion");
  });

  it("should reject when the Levenshtein implementation cannot be computed", async () => {
    levImpl.mockImplementation(() => {
      throw new Error("compute failed");
    });
    await expect(checkTypo("user@mac.co")).rejects.toThrow("compute failed");
  });
});
