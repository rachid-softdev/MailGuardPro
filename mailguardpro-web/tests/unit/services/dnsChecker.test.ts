import * as dns from "dns/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkDMARC, checkMX, checkSPF, getDomainInfo } from "@/services/dnsChecker";

// Mock dns/promises
vi.mock("dns/promises", () => {
  const mockResolveMx = vi.fn();
  const mockResolveTxt = vi.fn();
  const mockResolve4 = vi.fn();
  return {
    __esModule: true,
    default: {
      resolveMx: mockResolveMx,
      resolveTxt: mockResolveTxt,
      resolve4: mockResolve4,
    },
    resolveMx: mockResolveMx,
    resolveTxt: mockResolveTxt,
    resolve4: mockResolve4,
  };
});

describe("dnsChecker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkMX", () => {
    it("should return passed with valid MX records", async () => {
      vi.mocked(dns.resolveMx).mockResolvedValue([
        { priority: 10, exchange: "mx1.example.com" },
        { priority: 20, exchange: "mx2.example.com" },
      ]);

      const result = await checkMX("user@example.com");

      expect(result.passed).toBe(true);
      expect(result.message).toBe("MX valide");
      expect(result.detail).toContain("mx1.example.com");
    });

    it("should return failed when no MX records found", async () => {
      vi.mocked(dns.resolveMx).mockResolvedValue([]);

      const result = await checkMX("user@example.com");

      expect(result.passed).toBe(false);
      expect(result.message).toBe("Aucun enregistrement MX trouvé");
      expect(result.weight).toBe(0);
    });

    it("should sort MX records by priority", async () => {
      vi.mocked(dns.resolveMx).mockResolvedValue([
        { priority: 30, exchange: "mx3.example.com" },
        { priority: 10, exchange: "mx1.example.com" },
        { priority: 20, exchange: "mx2.example.com" },
      ]);

      const result = await checkMX("user@example.com");

      expect(result.detail).toContain("mx1.example.com");
      expect(result.detail).toContain("priorité: 10");
    });

    it("should handle DNS resolution errors", async () => {
      vi.mocked(dns.resolveMx).mockRejectedValue(new Error("DNS error"));

      const result = await checkMX("user@invalid.com");

      expect(result.passed).toBe(false);
      expect(result.message).toBe("Erreur de résolution DNS");
    });

    it("should handle undefined MX records", async () => {
      vi.mocked(dns.resolveMx).mockResolvedValue(undefined as any);

      const result = await checkMX("user@example.com");

      expect(result.passed).toBe(false);
    });
  });

  describe("checkSPF", () => {
    it("should return passed when SPF record found", async () => {
      vi.mocked(dns.resolveTxt).mockResolvedValue([["v=spf1", "include:_spf.google.com", "+all"]]);

      const result = await checkSPF("example.com");

      expect(result.passed).toBe(true);
      expect(result.message).toBe("SPF configuré");
      expect(result.weight).toBe(5);
    });

    it("should return passed for SPF with softfail (~all)", async () => {
      vi.mocked(dns.resolveTxt).mockResolvedValue([["v=spf1", "~all"]]);

      const result = await checkSPF("example.com");

      expect(result.passed).toBe(true);
    });

    it("should return failed when no SPF record found", async () => {
      vi.mocked(dns.resolveTxt).mockResolvedValue([["some-other-record"]]);

      const result = await checkSPF("example.com");

      expect(result.passed).toBe(false);
      expect(result.message).toBe("SPF non trouvé");
    });

    it("should return failed when no TXT records exist", async () => {
      vi.mocked(dns.resolveTxt).mockResolvedValue([]);

      const result = await checkSPF("example.com");

      expect(result.passed).toBe(false);
    });

    it("should handle DNS errors", async () => {
      vi.mocked(dns.resolveTxt).mockRejectedValue(new Error("DNS error"));

      const result = await checkSPF("invalid.com");

      expect(result.passed).toBe(false);
      expect(result.message).toBe("Erreur vérification SPF");
    });

    it("should truncate long SPF records in detail", async () => {
      const longRecord = "v=spf1 include:_spf.google.com ~all " + "a".repeat(100);
      vi.mocked(dns.resolveTxt).mockResolvedValue([[longRecord]]);

      const result = await checkSPF("example.com");

      expect(result.detail?.length).toBeLessThanOrEqual(103); // 100 + '...'
    });
  });

  describe("checkDMARC", () => {
    it("should return passed when DMARC record found", async () => {
      vi.mocked(dns.resolveTxt).mockResolvedValue([
        ["v=DMARC1", "p=quarantine", "rua=mailto:dmarc@example.com"],
      ]);

      const result = await checkDMARC("example.com");

      expect(result.passed).toBe(true);
      expect(result.message).toBe("DMARC configuré");
    });

    it("should return failed when no DMARC record found", async () => {
      vi.mocked(dns.resolveTxt).mockResolvedValue([]);

      const result = await checkDMARC("example.com");

      expect(result.passed).toBe(false);
      expect(result.message).toBe("DMARC non trouvé");
    });

    it("should query _dmarc subdomain", async () => {
      vi.mocked(dns.resolveTxt).mockResolvedValue([["v=DMARC1", "p=none"]]);

      await checkDMARC("example.com");

      expect(dns.resolveTxt).toHaveBeenCalledWith("_dmarc.example.com");
    });

    it("should handle DNS errors", async () => {
      vi.mocked(dns.resolveTxt).mockRejectedValue(new Error("DNS error"));

      const result = await checkDMARC("invalid.com");

      expect(result.passed).toBe(false);
      expect(result.message).toBe("Erreur vérification DMARC");
    });

    it("should truncate long DMARC records", async () => {
      const longRecord = "v=DMARC1 p=quarantine rua=mailto:dmarc@example.com " + "a".repeat(100);
      vi.mocked(dns.resolveTxt).mockResolvedValue([[longRecord]]);

      const result = await checkDMARC("example.com");

      expect(result.detail?.length).toBeLessThanOrEqual(100);
    });
  });

  describe("getDomainInfo", () => {
    it("should return domain info with MX, SPF, and DMARC status", async () => {
      vi.mocked(dns.resolveMx).mockResolvedValue([{ priority: 10, exchange: "mx1.example.com" }]);
      vi.mocked(dns.resolveTxt).mockResolvedValue([["v=spf1 +all"], ["v=DMARC1 p=none"]]);

      const result = await getDomainInfo("example.com");

      expect(result.mx).toContain("mx1.example.com");
      expect(result.spf).toBe(true);
      expect(result.dmarc).toBe(true);
    });

    it("should handle empty responses", async () => {
      vi.mocked(dns.resolveMx).mockResolvedValue([]);
      vi.mocked(dns.resolveTxt).mockResolvedValue([]);

      const result = await getDomainInfo("empty.com");

      expect(result.mx).toEqual([]);
      expect(result.spf).toBe(false);
      expect(result.dmarc).toBe(false);
    });

    it("should handle DNS errors gracefully", async () => {
      vi.mocked(dns.resolveMx).mockRejectedValue(new Error("DNS error"));
      vi.mocked(dns.resolveTxt).mockRejectedValue(new Error("DNS error"));

      const result = await getDomainInfo("error.com");

      expect(result.mx).toEqual([]);
      expect(result.spf).toBe(false);
      expect(result.dmarc).toBe(false);
    });
  });
});
