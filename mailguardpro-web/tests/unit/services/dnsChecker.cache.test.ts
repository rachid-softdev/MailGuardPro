import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockResolveMx, mockResolveTxt } = vi.hoisted(() => ({
  mockResolveMx: vi.fn(),
  mockResolveTxt: vi.fn(),
}));

vi.mock("dns/promises", () => ({
  __esModule: true,
  default: { resolveMx: mockResolveMx, resolveTxt: mockResolveTxt },
  resolveMx: mockResolveMx,
  resolveTxt: mockResolveTxt,
}));

vi.mock("@/services/validationCache", () => ({
  getCachedDomainChecks: vi.fn(),
  setCachedDomainChecks: vi.fn(),
}));

import dns from "dns/promises";
import { checkDMARC, checkMX, checkSPF, getDomainInfo } from "@/services/dnsChecker";
import { getCachedDomainChecks } from "@/services/validationCache";

describe("dnsChecker — Redis cache hit (no DNS resolution)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("checkMX: returns cached mx without calling resolveMx", async () => {
    vi.mocked(getCachedDomainChecks).mockResolvedValue({
      mx: { passed: true, weight: 25, message: "MX valide", detail: "cached" },
    });
    const result = await checkMX("user@example.com");
    expect(result.message).toBe("MX valide");
    expect(dns.resolveMx).not.toHaveBeenCalled();
  });

  it("checkSPF: returns cached spf without calling resolveTxt", async () => {
    vi.mocked(getCachedDomainChecks).mockResolvedValue({
      spf: { passed: true, weight: 5, message: "SPF configuré" },
    });
    const result = await checkSPF("example.com");
    expect(result.message).toBe("SPF configuré");
    expect(dns.resolveTxt).not.toHaveBeenCalled();
  });

  it("checkDMARC: returns cached dmarc without calling resolveTxt", async () => {
    vi.mocked(getCachedDomainChecks).mockResolvedValue({
      dmarc: { passed: true, weight: 5, message: "DMARC configuré" },
    });
    const result = await checkDMARC("example.com");
    expect(result.message).toBe("DMARC configuré");
    expect(dns.resolveTxt).not.toHaveBeenCalled();
  });

  it("getDomainInfo: rebuilds {mx,spf,dmarc} from cache without DNS", async () => {
    vi.mocked(getCachedDomainChecks).mockResolvedValue({
      mx: { passed: true, detail: "Serveur principal: mx1.example.com (priorité: 10)" },
      spf: { passed: true },
      dmarc: { passed: true },
    });
    const result = await getDomainInfo("example.com");
    expect(result.mx.length).toBe(1);
    expect(result.mx[0]).toContain("mx1.example.com");
    expect(result.spf).toBe(true);
    expect(result.dmarc).toBe(true);
    expect(dns.resolveMx).not.toHaveBeenCalled();
    expect(dns.resolveTxt).not.toHaveBeenCalled();
  });
});
