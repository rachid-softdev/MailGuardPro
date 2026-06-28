/* eslint-disable @typescript-eslint/no-unused-vars */ import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Use vi.hoisted for proper hoisting
const { mockResolve4 } = vi.hoisted(() => ({
  mockResolve4: vi.fn(),
}));

vi.mock("dns/promises", () => ({
  __esModule: true,
  default: {
    resolve4: mockResolve4,
  },
  resolve4: mockResolve4,
}));

import { checkDNSBL } from "@/services/dnsblChecker";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sets up mockResolve4 so the very first call (domain resolution via
 * `dns.resolve4(domain)`) returns `domainIPs`, and every subsequent call
 * (DNSBL lookup via `dns.resolve4(lookupHost)`) is delegated to
 * `dnsblHandler`.
 */
function mockDomainAndDNSBL(
  domain: string,
  domainIPs: string[],
  dnsblHandler: (lookupHost: string) => Promise<string[]>,
) {
  let domainResolved = false;
  mockResolve4.mockImplementation((host: string) => {
    if (!domainResolved) {
      domainResolved = true;
      return Promise.resolve(domainIPs);
    }
    return dnsblHandler(host);
  });
}

/** Convenience: simulate NXDOMAIN (not listed on a DNSBL). */
function nxdomain(): Promise<string[]> {
  return Promise.reject(new Error("NXDOMAIN"));
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("dnsblChecker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkDNSBL", () => {
    // ---- Existing tests (kept & strengthened) ----

    it("should return passed when IP is not blacklisted", async () => {
      mockDomainAndDNSBL("clean-domain.com", ["192.168.1.1"], () => nxdomain());

      const result = await checkDNSBL("clean-domain.com");

      expect(result.passed).toBe(true);
      expect(result.message).toBe("Non blacklisté");
      expect(result.weight).toBe(0);
    });

    it("should return passed when no IP addresses found", async () => {
      mockResolve4.mockResolvedValue([]);

      const result = await checkDNSBL("no-ips.com");

      expect(result.passed).toBe(true);
      expect(result.message).toBe("Aucune IP trouvée");
      expect(result.weight).toBe(0);
    });

    it("should return failed when IP is blacklisted on Spamhaus", async () => {
      mockDomainAndDNSBL("blacklisted.com", ["192.168.1.1"], (host) =>
        host.endsWith("zen.spamhaus.org") ? Promise.resolve(["127.0.0.2"]) : nxdomain(),
      );

      const result = await checkDNSBL("blacklisted.com");

      expect(result.passed).toBe(false);
      expect(result.weight).toBe(-20);
      expect(result.message).toContain("Spamhaus Zen");
    });

    it("should handle DNS resolution errors for domain", async () => {
      mockResolve4.mockRejectedValue(new Error("DNS error"));

      const result = await checkDNSBL("invalid-domain.com");

      expect(result.passed).toBe(true);
      expect(result.message).toBe("Vérification impossible");
      expect(result.detail).toContain("Impossible de résoudre les IP du domaine");
      expect(result.weight).toBe(0);
    });

    it("should handle empty addresses array", async () => {
      mockResolve4.mockResolvedValueOnce([]);

      const result = await checkDNSBL("empty-ips.com");

      expect(result.passed).toBe(true);
      expect(result.weight).toBe(0);
      expect(result.message).toBe("Aucune IP trouvée");
    });

    it("should return passed when all checks pass", async () => {
      mockDomainAndDNSBL("clean.com", ["192.168.1.1"], () => nxdomain());

      const result = await checkDNSBL("clean.com");

      expect(result.passed).toBe(true);
      expect(result.message).toBe("Non blacklisté");
      expect(result.weight).toBe(0);
    });

    it("should handle unexpected errors gracefully", async () => {
      mockResolve4.mockImplementation((host: string) => {
        if (host.includes("clean-domain")) {
          return Promise.resolve(["192.168.1.1"]);
        }
        throw new Error("Unexpected DNS error");
      });

      const result = await checkDNSBL("clean-domain.com");

      expect(result.passed).toBe(true);
      expect(result.weight).toBe(0);
    });

    // ---- Multiple IP addresses ----

    describe("multiple IP addresses", () => {
      it("should return blacklisted when one of multiple IPs is listed", async () => {
        // First IP (192.168.1.1 → reversed "1.1.168.192") not listed on any DNSBL.
        // Second IP (10.0.0.1 → reversed "1.0.0.10") listed on Spamhaus.
        mockResolve4.mockImplementation((host: string) => {
          if (host === "multi-ip.com") {
            return Promise.resolve(["192.168.1.1", "10.0.0.1"]);
          }
          // Only the second IP's Spamhaus lookup returns a listing
          if (host.startsWith("1.0.0.10") && host.endsWith("zen.spamhaus.org")) {
            return Promise.resolve(["127.0.0.2"]);
          }
          return Promise.reject(new Error("NXDOMAIN"));
        });

        const result = await checkDNSBL("multi-ip.com");

        expect(result.passed).toBe(false);
        expect(result.message).toContain("Spamhaus Zen");
        expect(result.weight).toBe(-20);
      });

      it("should return not blacklisted when multiple IPs are all clean", async () => {
        mockDomainAndDNSBL("multi-ip.com", ["192.168.1.1", "10.0.0.1", "172.16.0.1"], () =>
          nxdomain(),
        );

        const result = await checkDNSBL("multi-ip.com");

        expect(result.passed).toBe(true);
        expect(result.message).toBe("Non blacklisté");
        expect(result.weight).toBe(0);
      });
    });

    // ---- Specific DNSBL providers ----

    describe("specific DNSBL providers", () => {
      it("should identify SpamCop listing with correct provider name", async () => {
        mockDomainAndDNSBL("spamcop.com", ["192.168.1.1"], (host) =>
          host.endsWith("bl.spamcop.net") ? Promise.resolve(["127.0.0.2"]) : nxdomain(),
        );

        const result = await checkDNSBL("spamcop.com");

        expect(result.passed).toBe(false);
        expect(result.message).toBe("IP blacklistée sur SpamCop BL");
        expect(result.weight).toBe(-20);
      });

      it("should identify SORBS listing with correct provider name", async () => {
        mockDomainAndDNSBL("sorbs.com", ["192.168.1.1"], (host) =>
          host.endsWith("dnsbl.sorbs.net") ? Promise.resolve(["127.0.0.2"]) : nxdomain(),
        );

        const result = await checkDNSBL("sorbs.com");

        expect(result.passed).toBe(false);
        expect(result.message).toBe("IP blacklistée sur SORBS");
        expect(result.weight).toBe(-20);
      });

      it("should identify SORBS Spam listing with correct provider name", async () => {
        mockDomainAndDNSBL("sorbs-spam.com", ["192.168.1.1"], (host) =>
          host.endsWith("spam.dnsbl.sorbs.net") ? Promise.resolve(["127.0.0.2"]) : nxdomain(),
        );

        const result = await checkDNSBL("sorbs-spam.com");

        expect(result.passed).toBe(false);
        expect(result.message).toBe("IP blacklistée sur SORBS Spam");
        expect(result.weight).toBe(-20);
      });

      it("should identify SORBS Web listing with correct provider name", async () => {
        mockDomainAndDNSBL("sorbs-web.com", ["192.168.1.1"], (host) =>
          host.endsWith("web.dnsbl.sorbs.net") ? Promise.resolve(["127.0.0.2"]) : nxdomain(),
        );

        const result = await checkDNSBL("sorbs-web.com");

        expect(result.passed).toBe(false);
        expect(result.message).toBe("IP blacklistée sur SORBS Web");
        expect(result.weight).toBe(-20);
      });
    });

    // ---- DNSBL return codes ----

    describe("DNSBL return codes", () => {
      it("should report spam source for return code 127", async () => {
        mockDomainAndDNSBL("spam.com", ["192.168.1.1"], (host) =>
          host.endsWith("zen.spamhaus.org") ? Promise.resolve(["127.0.0.2"]) : nxdomain(),
        );

        const result = await checkDNSBL("spam.com");

        expect(result.detail).toContain("Listé comme source de spam");
      });

      it("should report open relay for return code 64", async () => {
        mockDomainAndDNSBL("relay.com", ["192.168.1.1"], (host) =>
          host.endsWith("zen.spamhaus.org") ? Promise.resolve(["64.0.0.2"]) : nxdomain(),
        );

        const result = await checkDNSBL("relay.com");

        expect(result.detail).toContain("Listé comme sender open relay");
      });

      it("should report domainpike for return code 2", async () => {
        mockDomainAndDNSBL("dspam.com", ["192.168.1.1"], (host) =>
          host.endsWith("zen.spamhaus.org") ? Promise.resolve(["2.0.0.2"]) : nxdomain(),
        );

        const result = await checkDNSBL("dspam.com");

        expect(result.detail).toContain("Listé comme domainpike");
      });

      it("should handle unknown return codes with the code in the message", async () => {
        mockDomainAndDNSBL("unknown.com", ["192.168.1.1"], (host) =>
          host.endsWith("zen.spamhaus.org") ? Promise.resolve(["99.0.0.2"]) : nxdomain(),
        );

        const result = await checkDNSBL("unknown.com");

        expect(result.detail).toContain("99");
        expect(result.detail).toContain("Listé (code:");
      });

      it("should handle address with only one octet for return code check", async () => {
        // Edge: returned address has more parts — first octet still extracted via split(".")[0]
        mockDomainAndDNSBL("weird.com", ["192.168.1.1"], (host) =>
          host.endsWith("zen.spamhaus.org") ? Promise.resolve(["127.0.0.2.extra"]) : nxdomain(),
        );

        const result = await checkDNSBL("weird.com");

        expect(result.passed).toBe(false);
        // First octet is "127" → spam source
        expect(result.detail).toContain("Listé comme source de spam");
      });
    });

    // ---- DNSBL lookup failures ----

    describe("DNSBL lookup failures", () => {
      it("should not be blacklisted when all DNSBL servers return NXDOMAIN", async () => {
        mockDomainAndDNSBL("clean.com", ["192.168.1.1"], () => nxdomain());

        const result = await checkDNSBL("clean.com");

        expect(result.passed).toBe(true);
        expect(result.message).toBe("Non blacklisté");
        expect(result.weight).toBe(0);
      });

      it("should handle DNSBL lookup timeouts gracefully", async () => {
        vi.useFakeTimers();
        try {
          let domainResolved = false;
          mockResolve4.mockImplementation((host: string) => {
            if (!domainResolved) {
              domainResolved = true;
              return Promise.resolve(["192.168.1.1"]);
            }
            // Never settles → triggers the 3 s timeout in resolveWithTimeout
            return new Promise<string[]>(() => {});
          });

          const promise = checkDNSBL("timeout.com");

          // Advance by more than 5 × 3 s so all five DNSBL timeouts fire
          await vi.advanceTimersByTimeAsync(20_000);

          const result = await promise;

          expect(result.passed).toBe(true);
          expect(result.message).toBe("Non blacklisté");
          expect(result.weight).toBe(0);
        } finally {
          vi.useRealTimers();
        }
      });

      it("should handle empty DNSBL response (addresses array is empty)", async () => {
        // dns.resolve4 returns [] for a DNSBL lookup → checkIPBlacklist line 64
        let resolveCount = 0;
        mockResolve4.mockImplementation((host: string) => {
          resolveCount++;
          if (resolveCount === 1) {
            return Promise.resolve(["192.168.1.1"]);
          }
          // Return empty array (truthy but length === 0)
          return Promise.resolve([]);
        });

        const result = await checkDNSBL("empty-result.com");

        expect(result.passed).toBe(true);
        expect(result.message).toBe("Non blacklisté");
        expect(result.weight).toBe(0);
      });

      it("should handle DNS errors during blacklist check gracefully", async () => {
        // After domain resolves, all DNSBL lookups reject with DNS error
        mockDomainAndDNSBL("flakey.com", ["192.168.1.1"], () =>
          Promise.reject(new Error("DNS query failed")),
        );

        const result = await checkDNSBL("flakey.com");

        expect(result.passed).toBe(true);
        expect(result.message).toBe("Non blacklisté");
        expect(result.weight).toBe(0);
      });
    });

    // ---- Edge cases ----

    describe("edge cases", () => {
      it("should handle empty domain string", async () => {
        mockResolve4.mockRejectedValue(new Error("DNS error"));

        const result = await checkDNSBL("");

        expect(result.passed).toBe(true);
        expect(result.message).toBe("Vérification impossible");
        expect(result.weight).toBe(0);
      });

      it("should handle very long domain", async () => {
        mockResolve4.mockRejectedValue(new Error("DNS error"));

        const longDomain = "a" + "b".repeat(250) + ".com";
        const result = await checkDNSBL(longDomain);

        expect(result.passed).toBe(true);
        expect(result.message).toBe("Vérification impossible");
        expect(result.weight).toBe(0);
      });

      it("should handle domain with unexpected characters", async () => {
        mockResolve4.mockRejectedValue(new Error("DNS error"));

        const result = await checkDNSBL("test@@domain!!.com");

        expect(result.passed).toBe(true);
        expect(result.message).toBe("Vérification impossible");
        expect(result.weight).toBe(0);
      });

      it("should handle non-iterable domain resolution result (triggers outer catch with Error)", async () => {
        // Return a plain object (truthy, no length, not iterable).
        // Passes !addresses / length checks but for...of throws TypeError (Error instance).
        mockResolve4.mockResolvedValue({ foo: "bar" } as unknown as string[]);

        const result = await checkDNSBL("weird-result.com");

        expect(result.passed).toBe(true);
        expect(result.message).toBe("Vérification échouée");
        expect(result.weight).toBe(0);
        expect(result.detail).toContain("not iterable");
      });

      it("should handle non-Error thrown during processing (outer catch, Erreur inconnue)", async () => {
        // Use a Proxy that only throws on .length access.
        // This avoids breaking Promise.resolve() which checks .then.
        const throwingObj = new Proxy(
          {},
          {
            get(_target, prop) {
              if (prop === "length") {
                throw "Something went wrong (not an Error)";
              }
              return undefined;
            },
          },
        );
        mockResolve4.mockResolvedValue(throwingObj as unknown as string[]);

        const result = await checkDNSBL("proxy-throw.com");

        expect(result.passed).toBe(true);
        expect(result.message).toBe("Vérification échouée");
        expect(result.weight).toBe(0);
        expect(result.detail).toBe("Erreur inconnue");
      });

      it("should handle non-ASCII characters in domain", async () => {
        mockResolve4.mockRejectedValue(new Error("DNS error"));

        const result = await checkDNSBL("éxämple.com");

        expect(result.passed).toBe(true);
        expect(result.message).toBe("Vérification impossible");
        expect(result.weight).toBe(0);
      });
    });

    // ---- Weight verification ----

    describe("weight correctness", () => {
      it("should set weight to -20 when blacklisted", async () => {
        mockDomainAndDNSBL("bad.com", ["192.168.1.1"], (host) =>
          host.endsWith("zen.spamhaus.org") ? Promise.resolve(["127.0.0.2"]) : nxdomain(),
        );

        const result = await checkDNSBL("bad.com");

        expect(result.passed).toBe(false);
        expect(result.weight).toBe(-20);
      });

      it("should set weight to 0 when not blacklisted", async () => {
        mockDomainAndDNSBL("good.com", ["192.168.1.1"], () => nxdomain());

        const result = await checkDNSBL("good.com");

        expect(result.passed).toBe(true);
        expect(result.weight).toBe(0);
      });
    });

    // ---- Message format ----

    describe("message format", () => {
      it("should include provider name in message when blacklisted", async () => {
        mockDomainAndDNSBL("listed.com", ["192.168.1.1"], (host) =>
          host.endsWith("bl.spamcop.net") ? Promise.resolve(["127.0.0.2"]) : nxdomain(),
        );

        const result = await checkDNSBL("listed.com");

        expect(result.message).toBe("IP blacklistée sur SpamCop BL");
      });

      it("should include IP and provider host in detail when blacklisted", async () => {
        mockDomainAndDNSBL("listed.com", ["192.168.1.1"], (host) =>
          host.endsWith("zen.spamhaus.org") ? Promise.resolve(["127.0.0.2"]) : nxdomain(),
        );

        const result = await checkDNSBL("listed.com");

        expect(result.detail).toContain("192.168.1.1");
        expect(result.detail).toContain("zen.spamhaus.org");
        expect(result.detail).toContain("Listé comme source de spam");
      });
    });

    // ---- Not blacklisted scenarios ----

    describe("not blacklisted scenarios", () => {
      it("should return not blacklisted when no server lists the IP", async () => {
        mockDomainAndDNSBL("clean.com", ["192.168.1.1"], () => nxdomain());

        const result = await checkDNSBL("clean.com");

        expect(result.passed).toBe(true);
        expect(result.message).toBe("Non blacklisté");
        expect(result.weight).toBe(0);
        expect(result.detail).toBeUndefined();
      });

      it("should return not blacklisted when addresses exist but all DNSBL lookups time out", async () => {
        vi.useFakeTimers();
        try {
          let domainResolved = false;
          mockResolve4.mockImplementation((host: string) => {
            if (!domainResolved) {
              domainResolved = true;
              return Promise.resolve(["10.0.0.1"]);
            }
            return new Promise<string[]>(() => {});
          });

          const promise = checkDNSBL("slow.com");
          await vi.advanceTimersByTimeAsync(20_000);
          const result = await promise;

          expect(result.passed).toBe(true);
          expect(result.message).toBe("Non blacklisté");
          expect(result.weight).toBe(0);
        } finally {
          vi.useRealTimers();
        }
      });
    });
  });
});
