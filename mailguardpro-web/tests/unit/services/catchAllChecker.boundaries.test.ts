import * as dns from "dns/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkCatchAll, checkCatchAllQuick } from "@/services/catchAllChecker";

vi.mock("dns/promises", () => {
  const mockResolveMx = vi.fn();
  return {
    __esModule: true,
    default: { resolveMx: mockResolveMx },
    resolveMx: mockResolveMx,
  };
});

describe("catchAllChecker — exact MX-count boundaries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("checkCatchAll: exactly 5 MX records => passed (threshold is >5)", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        priority: (i + 1) * 10,
        exchange: `mx${i + 1}.example.com`,
      })),
    );
    const result = await checkCatchAll("example.com");
    expect(result.passed).toBe(true);
    expect(result.message).toBe("Non catch-all");
  });

  it("checkCatchAll: 6 MX records => failed (catch-all likely)", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({
        priority: (i + 1) * 10,
        exchange: `mx${i + 1}.example.com`,
      })),
    );
    const result = await checkCatchAll("example.com");
    expect(result.passed).toBe(false);
  });

  it("checkCatchAllQuick: exactly 4 MX records => passed (threshold is >4)", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue(
      Array.from({ length: 4 }, (_, i) => ({
        priority: (i + 1) * 10,
        exchange: `mx${i + 1}.example.com`,
      })),
    );
    const result = await checkCatchAllQuick("example.com");
    expect(result.passed).toBe(true);
    expect(result.message).toBe("Likely not catch-all");
  });

  it("checkCatchAllQuick: 5 MX records => failed", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        priority: (i + 1) * 10,
        exchange: `mx${i + 1}.example.com`,
      })),
    );
    const result = await checkCatchAllQuick("example.com");
    expect(result.passed).toBe(false);
  });
});
