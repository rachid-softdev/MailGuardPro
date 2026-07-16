import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockResolveMx } = vi.hoisted(() => ({ mockResolveMx: vi.fn() }));

vi.mock("dns/promises", () => ({
  __esModule: true,
  default: { resolveMx: mockResolveMx },
  resolveMx: mockResolveMx,
}));

vi.mock("@/services/validationCache", () => ({
  getCachedDomainChecks: vi.fn(),
  setCachedDomainChecks: vi.fn(),
}));

import { checkMX } from "@/services/dnsChecker";

describe("dnsChecker — resolveWithTimeout DNS timeout", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should return 'Erreur de résolution DNS' when DNS never resolves (timeout fires)", async () => {
    vi.useFakeTimers();
    try {
      // never-resolving promise -> the Promise.race timeout rejects
      mockResolveMx.mockReturnValue(new Promise<void>(() => {}));
      const p = checkMX("user@example.com");
      await vi.advanceTimersByTimeAsync(6000);
      const res = await p;
      expect(res.passed).toBe(false);
      expect(res.message).toBe("Erreur de résolution DNS");
    } finally {
      vi.useRealTimers();
    }
  });
});
