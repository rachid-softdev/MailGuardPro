import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getClientIp,
  resolveWebhookIps,
  validateResolvedIp,
  validateWebhookUrl,
  validateWebhookUrlWithDns,
} from "@/lib/ssrf";

// Mock dns/promises to control DNS resolution in validateWebhookUrlWithDns
// Source uses: import dns from "dns/promises"  (default import)
// Tests use: const dns = await import("dns/promises")  (namespace import)
// Both routes must reference the same mock fns.
// vi.hoisted is needed because vi.mock factory is hoisted to top of file.
const { mockResolve4, mockResolve6 } = vi.hoisted(() => ({
  mockResolve4: vi.fn(),
  mockResolve6: vi.fn(),
}));
vi.mock("dns/promises", () => ({
  default: {
    resolve4: mockResolve4,
    resolve6: mockResolve6,
  },
  resolve4: mockResolve4,
  resolve6: mockResolve6,
}));

// ────────────────────────────────────────────
// validateResolvedIp
// ────────────────────────────────────────────

describe("validateResolvedIp", () => {
  describe("public IPs (allowed)", () => {
    it("should allow public IPv4", () => {
      expect(validateResolvedIp("93.184.216.34").valid).toBe(true);
    });

    it("should allow public IPv6", () => {
      expect(validateResolvedIp("2001:db8::1").valid).toBe(true);
    });
  });

  describe("private IPv4 ranges (blocked)", () => {
    it("should block 127.0.0.1 (loopback)", () => {
      expect(validateResolvedIp("127.0.0.1").valid).toBe(false);
    });

    it("should block 10.0.0.1 (class A private)", () => {
      expect(validateResolvedIp("10.0.0.1").valid).toBe(false);
    });

    it("should block 172.16.0.1 (class B private)", () => {
      expect(validateResolvedIp("172.16.0.1").valid).toBe(false);
    });

    it("should block 172.31.255.255 (class B private upper)", () => {
      expect(validateResolvedIp("172.31.255.255").valid).toBe(false);
    });

    it("should allow 172.32.0.1 (not private)", () => {
      expect(validateResolvedIp("172.32.0.1").valid).toBe(true);
    });

    it("should block 192.168.1.1 (class C private)", () => {
      expect(validateResolvedIp("192.168.1.1").valid).toBe(false);
    });

    it("should block 169.254.1.1 (link-local)", () => {
      expect(validateResolvedIp("169.254.1.1").valid).toBe(false);
    });

    it("should block 0.0.0.0 (current network)", () => {
      expect(validateResolvedIp("0.0.0.0").valid).toBe(false);
    });
  });

  describe("IPv6 ranges (blocked)", () => {
    it("should block ::1 (loopback)", () => {
      expect(validateResolvedIp("::1").valid).toBe(false);
    });

    it("should block fc00::1 (ULA)", () => {
      expect(validateResolvedIp("fc00::1").valid).toBe(false);
    });

    it("should block fd00::1 (ULA)", () => {
      expect(validateResolvedIp("fd00::1").valid).toBe(false);
    });

    it("should block fd12:3456:789a::1 (ULA broader)", () => {
      expect(validateResolvedIp("fd12:3456:789a::1").valid).toBe(false);
    });

    it("should block fe80::1 (link-local)", () => {
      expect(validateResolvedIp("fe80::1").valid).toBe(false);
    });

    it("should block ff00::1 (multicast)", () => {
      expect(validateResolvedIp("ff00::1").valid).toBe(false);
    });
  });

  describe("case normalization", () => {
    it("should block uppercase FD00::1", () => {
      expect(validateResolvedIp("FD00::1").valid).toBe(false);
    });

    it("should block uppercase FC00::1", () => {
      expect(validateResolvedIp("FC00::1").valid).toBe(false);
    });

    it("should block uppercase FE80::1", () => {
      expect(validateResolvedIp("FE80::1").valid).toBe(false);
    });
  });

  describe("IPv4-mapped IPv6 addresses", () => {
    it("should block ::ffff:127.0.0.1 (loopback)", () => {
      expect(validateResolvedIp("::ffff:127.0.0.1").valid).toBe(false);
    });

    it("should block ::ffff:10.0.0.1 (private)", () => {
      expect(validateResolvedIp("::ffff:10.0.0.1").valid).toBe(false);
    });

    it("should block ::ffff:192.168.1.1 (private)", () => {
      expect(validateResolvedIp("::ffff:192.168.1.1").valid).toBe(false);
    });

    it("should block ::ffff:172.16.0.1 (private)", () => {
      expect(validateResolvedIp("::ffff:172.16.0.1").valid).toBe(false);
    });

    it("should allow ::ffff:93.184.216.34 (public)", () => {
      expect(validateResolvedIp("::ffff:93.184.216.34").valid).toBe(true);
    });
  });

  describe("IPv6 unspecified address", () => {
    it("should block :: (unspecified)", () => {
      expect(validateResolvedIp("::").valid).toBe(false);
    });
  });

  describe("input validation", () => {
    it("should reject empty string", () => {
      expect(validateResolvedIp("").valid).toBe(false);
    });

    it("should reject non-IP string", () => {
      expect(validateResolvedIp("not-an-ip").valid).toBe(false);
    });

    it("should reject hostname", () => {
      expect(validateResolvedIp("example.com").valid).toBe(false);
    });
  });
});

// ────────────────────────────────────────────
// validateWebhookUrl (static URL validation)
// ────────────────────────────────────────────

describe("validateWebhookUrl", () => {
  it("should allow valid HTTPS domain URL", () => {
    expect(validateWebhookUrl("https://example.com/webhook").valid).toBe(true);
  });

  it("should allow HTTPS URL with path", () => {
    const result = validateWebhookUrl("https://hooks.example.com/callback");
    expect(result.valid).toBe(true);
  });

  it("should allow HTTPS URL with port", () => {
    const result = validateWebhookUrl("https://hooks.example.com:8443/webhook");
    expect(result.valid).toBe(true);
  });

  it("should allow HTTPS URL with trailing slash", () => {
    const result = validateWebhookUrl("https://hooks.example.com/");
    expect(result.valid).toBe(true);
  });

  it("should reject HTTP URL", () => {
    const result = validateWebhookUrl("http://example.com/webhook");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("HTTPS");
  });

  it("should reject private IP URL (127.0.0.1)", () => {
    const result = validateWebhookUrl("https://127.0.0.1/webhook");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/private IP|not allowed/i);
  });

  it("should reject public IP URL (domain names only)", () => {
    const result = validateWebhookUrl("https://93.184.216.34/webhook");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Domain names only");
  });

  it("should reject IPv4-mapped IPv6 URL", () => {
    const result = validateWebhookUrl("https://[::ffff:127.0.0.1]/webhook");
    expect(result.valid).toBe(false);
  });

  it("should reject blocked hostname (localhost)", () => {
    const result = validateWebhookUrl("https://localhost/webhook");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Internal hostnames");
  });

  it("should reject metadata.google.internal", () => {
    const result = validateWebhookUrl("https://metadata.google.internal/");
    expect(result.valid).toBe(false);
  });

  it("should reject 169.254.169.254 IP", () => {
    const result = validateWebhookUrl("https://169.254.169.254/");
    expect(result.valid).toBe(false);
  });

  it("should reject invalid URL format", () => {
    const result = validateWebhookUrl("not-a-url");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid URL format");
  });

  it("should reject IPv6 loopback URL [::1]", () => {
    const result = validateWebhookUrl("https://[::1]/webhook");
    expect(result.valid).toBe(false);
  });

  it("should reject IPv6 loopback URL [::1] with non-default port", () => {
    const result = validateWebhookUrl("https://[::1]:8443/webhook");
    expect(result.valid).toBe(false);
  });

  it("should reject 10.x.x.x private IP that is not in BLOCKED_HOSTNAMES (line 83)", () => {
    const result = validateWebhookUrl("https://10.0.0.1/webhook");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Private IP ranges are not allowed");
  });

  it("should reject 192.168.x.x private IP (line 83)", () => {
    const result = validateWebhookUrl("https://192.168.1.1/webhook");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Private IP ranges are not allowed");
  });

  it("should reject 172.16.x.x private IP (line 83)", () => {
    const result = validateWebhookUrl("https://172.16.0.1/webhook");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Private IP ranges are not allowed");
  });

  it("should reject public IPv4-mapped IPv6 as direct IP (hits v4MappedMatch truthy, no private match)", () => {
    // ::ffff:192.0.2.1 is an IPv4-mapped IPv6, regex matches, but 192.0.2.1 is
    // public (TEST-NET), so no private IP pattern matches → falls through to
    // "Domain names only" at line 87
    const result = validateWebhookUrl("https://[::ffff:192.0.2.1]/webhook");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Domain names only, no direct IP addresses");
  });

  it("should hit v4MappedMatch ternary truthy branch via URL mock", () => {
    // Node.js URL normalizes IPv4-mapped IPv6 to hex (::ffff:a00:1 instead of ::ffff:10.0.0.1)
    // which no longer matches IPV4_MAPPED_IPV6_RE. We mock URL to prevent normalization
    // so the truthy branch `v4MappedMatch ? v4MappedMatch[1] : ...` is exercised.
    class MockURL {
      protocol: string;
      hostname: string;
      href: string;
      constructor(urlStr: string) {
        this.protocol = "https:";
        this.hostname = "::ffff:10.0.0.1";
        this.href = urlStr;
      }
    }
    vi.stubGlobal("URL", MockURL);

    try {
      const result = validateWebhookUrl("https://[::ffff:10.0.0.1]/webhook");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Private IP ranges are not allowed");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("should hit v4MappedMatch ternary falsy branch via plain IPv6", () => {
    // fc00::1 does not match IPV4_MAPPED_IPV6_RE (no ::ffff: prefix)
    // v4MappedMatch is null (falsy) → normalizedHostname = "fc00::1"
    // Then fc00::1 matches /^f[cd].../ → private IP error
    const result = validateWebhookUrl("https://[fc00::1]/webhook");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Private IP ranges are not allowed");
  });
});

// ────────────────────────────────────────────
// validateWebhookUrlWithDns (DNS-enhanced SSRF check)
// ────────────────────────────────────────────

describe("validateWebhookUrlWithDns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reject invalid URL format (delegates to validateWebhookUrl)", async () => {
    const result = await validateWebhookUrlWithDns("not-a-url");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid URL format");
  });

  it("should reject HTTP URL (delegates to validateWebhookUrl)", async () => {
    const result = await validateWebhookUrlWithDns("http://example.com/hook");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("HTTPS");
  });

  it("should reject direct private IP (delegates to validateWebhookUrl)", async () => {
    const result = await validateWebhookUrlWithDns("https://127.0.0.1/hook");
    expect(result.valid).toBe(false);
  });

  it("should reject blocked hostname (delegates to validateWebhookUrl)", async () => {
    const result = await validateWebhookUrlWithDns("https://localhost/hook");
    expect(result.valid).toBe(false);
  });

  it("should validate a valid public domain that resolves to public IPs", async () => {
    const dns = await import("dns/promises");
    vi.mocked(dns.default.resolve4).mockResolvedValue(["93.184.216.34"]);

    const result = await validateWebhookUrlWithDns("https://example.com/hook");
    expect(result.valid).toBe(true);
  });

  it("should return resolvedIps for a valid domain (M-1 fix)", async () => {
    const dns = await import("dns/promises");
    vi.mocked(dns.default.resolve4).mockResolvedValue(["93.184.216.34", "93.184.216.35"]);

    const result = await validateWebhookUrlWithDns("https://example.com/hook");
    expect(result.valid).toBe(true);
    expect(result.resolvedIps).toBeDefined();
    expect(result.resolvedIps).toEqual(["93.184.216.34", "93.184.216.35"]);
  });

  it("should return resolvedIps with IPv6 fallback (M-1 fix)", async () => {
    const dns = await import("dns/promises");
    vi.mocked(dns.default.resolve4).mockRejectedValue(new Error("ENOTFOUND"));
    vi.mocked(dns.default.resolve6).mockResolvedValue(["2001:db8::1", "2001:db8::2"]);

    const result = await validateWebhookUrlWithDns("https://ipv6.example.com/hook");
    expect(result.valid).toBe(true);
    expect(result.resolvedIps).toBeDefined();
    expect(result.resolvedIps).toEqual(["2001:db8::1", "2001:db8::2"]);
  });

  it("should NOT return resolvedIps when URL is invalid (M-1 fix)", async () => {
    const result = await validateWebhookUrlWithDns("not-a-url");
    expect(result.valid).toBe(false);
    expect(result.resolvedIps).toBeUndefined();
  });

  it("should not return resolvedIps for blocked hostname (M-1 fix)", async () => {
    const result = await validateWebhookUrlWithDns("https://localhost/hook");
    expect(result.valid).toBe(false);
    expect(result.resolvedIps).toBeUndefined();
  });

  it("should return empty array for unresolvable domain (M-1 edge case)", async () => {
    const dns = await import("dns/promises");
    vi.mocked(dns.default.resolve4).mockResolvedValue([]);
    vi.mocked(dns.default.resolve6).mockRejectedValue(new Error("ENOTFOUND"));

    const result = await validateWebhookUrlWithDns("https://empty.example.com/hook");
    expect(result.valid).toBe(false);
    expect(result.resolvedIps).toBeUndefined();
  });

  it("should reject a domain that resolves to a private IP", async () => {
    const dns = await import("dns/promises");
    vi.mocked(dns.default.resolve4).mockResolvedValue(["10.0.0.1"]);

    const result = await validateWebhookUrlWithDns("https://internal.example.com/hook");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("blocked IP");
  });

  it("should reject a domain that resolves to a loopback IP", async () => {
    const dns = await import("dns/promises");
    vi.mocked(dns.default.resolve4).mockResolvedValue(["127.0.0.1"]);

    const result = await validateWebhookUrlWithDns("https://localhost-evil.com/hook");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("blocked IP");
  });

  it("should reject a domain that resolves to metadata IP", async () => {
    const dns = await import("dns/promises");
    vi.mocked(dns.default.resolve4).mockResolvedValue(["169.254.169.254"]);

    const result = await validateWebhookUrlWithDns("https://metadata.evil.com/hook");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("blocked IP");
  });

  it("should fallback to IPv6 when IPv4 resolution fails", async () => {
    const dns = await import("dns/promises");
    vi.mocked(dns.default.resolve4).mockRejectedValue(new Error("ENOTFOUND"));
    vi.mocked(dns.default.resolve6).mockResolvedValue(["2001:db8::1"]);

    const result = await validateWebhookUrlWithDns("https://ipv6-only.example.com/hook");
    expect(result.valid).toBe(true);
  });

  it("should reject IPv6 fallback that resolves to private address", async () => {
    const dns = await import("dns/promises");
    vi.mocked(dns.default.resolve4).mockRejectedValue(new Error("ENOTFOUND"));
    vi.mocked(dns.default.resolve6).mockResolvedValue(["fc00::1"]);

    const result = await validateWebhookUrlWithDns("https://ipv6-private.example.com/hook");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("blocked IP");
  });

  it("should return failure when both IPv4 and IPv6 resolution fail", async () => {
    const dns = await import("dns/promises");
    vi.mocked(dns.default.resolve4).mockRejectedValue(new Error("ENOTFOUND"));
    vi.mocked(dns.default.resolve6).mockRejectedValue(new Error("ENOTFOUND"));

    const result = await validateWebhookUrlWithDns("https://unknown.example.com/hook");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Cannot resolve hostname");
  });

  it("should return failure when IPv4 returns empty and IPv6 fails", async () => {
    const dns = await import("dns/promises");
    vi.mocked(dns.default.resolve4).mockResolvedValue([]);
    vi.mocked(dns.default.resolve6).mockRejectedValue(new Error("ENOTFOUND"));

    const result = await validateWebhookUrlWithDns("https://empty.example.com/hook");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Cannot resolve hostname");
  });

  it("should handle DNS metadata hostname correctly", async () => {
    const result = await validateWebhookUrlWithDns("https://metadata.google.internal/hook");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Internal hostnames");
  });

  it("should handle URL constructor throwing after initial validation (line 113)", async () => {
    // Use an object with a dynamic toString to make the first new URL() succeed
    // and the second new URL() (inside validateWebhookUrlWithDns) throw
    let callCount = 0;
    const dynamicUrl = {
      toString: () => {
        callCount++;
        if (callCount === 1) return "https://example.com/hook";
        throw new TypeError("Simulated URL parse failure");
      },
    };
    const result = await validateWebhookUrlWithDns(dynamicUrl as any);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid URL format");
  });

  it("should hit the isIP guard when hostname changes between URL parsings (line 120)", async () => {
    // Make the first new URL() return a valid domain and the second return an IP
    // This forces validateWebhookUrl to pass then the isIP check to trigger
    let firstCall = true;
    const dynamicUrl = {
      toString: () => {
        if (firstCall) {
          firstCall = false;
          return "https://example.com/hook";
        }
        return "https://192.168.1.1/hook";
      },
    };
    const result = await validateWebhookUrlWithDns(dynamicUrl as any);
    // baseCheck was valid, so it returns { valid: true } without DNS resolution
    expect(result.valid).toBe(true);
  });
});

// ────────────────────────────────────────────
// resolveWebhookIps
// ────────────────────────────────────────────

describe("resolveWebhookIps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("success paths", () => {
    it("should resolve hostname to public IPv4", async () => {
      mockResolve4.mockResolvedValue(["93.184.216.34"]);

      const result = await resolveWebhookIps("example.com");
      expect(result.valid).toBe(true);
      expect(result.ips).toEqual(["93.184.216.34"]);
      expect(mockResolve4).toHaveBeenCalledWith("example.com");
    });

    it("should resolve hostname to multiple public IPv4s", async () => {
      mockResolve4.mockResolvedValue(["93.184.216.34", "93.184.216.35"]);

      const result = await resolveWebhookIps("example.com");
      expect(result.valid).toBe(true);
      expect(result.ips).toEqual(["93.184.216.34", "93.184.216.35"]);
    });

    it("should fallback to IPv6 when IPv4 resolution fails", async () => {
      mockResolve4.mockRejectedValue(new Error("ENOTFOUND"));
      mockResolve6.mockResolvedValue(["2001:db8::1"]);

      const result = await resolveWebhookIps("ipv6-only.example.com");
      expect(result.valid).toBe(true);
      expect(result.ips).toEqual(["2001:db8::1"]);
      expect(mockResolve6).toHaveBeenCalledWith("ipv6-only.example.com");
    });

    it("should fallback to IPv6 when IPv4 returns empty array", async () => {
      mockResolve4.mockResolvedValue([]);
      mockResolve6.mockResolvedValue(["2001:db8::1"]);

      const result = await resolveWebhookIps("ipv6-fallback.example.com");
      expect(result.valid).toBe(true);
      expect(result.ips).toEqual(["2001:db8::1"]);
      expect(mockResolve6).toHaveBeenCalledWith("ipv6-fallback.example.com");
    });
  });

  describe("error/failure paths", () => {
    it("should reject direct IPv4 address", async () => {
      const result = await resolveWebhookIps("93.184.216.34");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Domain names only");
      expect(mockResolve4).not.toHaveBeenCalled();
    });

    it("should reject direct IPv6 address", async () => {
      const result = await resolveWebhookIps("::1");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Domain names only");
    });

    it("should reject direct IPv6 address in brackets [::1]", async () => {
      const result = await resolveWebhookIps("[::1]");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Domain names only");
    });

    it("should reject direct IPv4-mapped IPv6 address", async () => {
      const result = await resolveWebhookIps("::ffff:127.0.0.1");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Domain names only");
    });

    it("should return error when both IPv4 and IPv6 resolution fail", async () => {
      mockResolve4.mockRejectedValue(new Error("ENOTFOUND"));
      mockResolve6.mockRejectedValue(new Error("ENOTFOUND"));

      const result = await resolveWebhookIps("unknown.example.com");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Cannot resolve hostname");
    });

    it("should return error when IPv4 returns empty and IPv6 fails", async () => {
      mockResolve4.mockResolvedValue([]);
      mockResolve6.mockRejectedValue(new Error("ENOTFOUND"));

      const result = await resolveWebhookIps("empty.example.com");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Cannot resolve hostname");
    });
  });

  describe("private IP blocking", () => {
    it("should block hostname resolving to 10.x.x.x (private class A)", async () => {
      mockResolve4.mockResolvedValue(["10.0.0.1"]);

      const result = await resolveWebhookIps("internal.example.com");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Blocked IP");
      expect(result.error).toContain("10.0.0.1");
    });

    it("should block hostname resolving to 127.x.x.x (loopback)", async () => {
      mockResolve4.mockResolvedValue(["127.0.0.1"]);

      const result = await resolveWebhookIps("localhost-evil.com");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Blocked IP");
      expect(result.error).toContain("127.0.0.1");
    });

    it("should block hostname resolving to 169.254.x.x (link-local)", async () => {
      mockResolve4.mockResolvedValue(["169.254.169.254"]);

      const result = await resolveWebhookIps("metadata.evil.com");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Blocked IP");
    });

    it("should block hostname resolving to 192.168.x.x (private class C)", async () => {
      mockResolve4.mockResolvedValue(["192.168.1.1"]);

      const result = await resolveWebhookIps("router.evil.com");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Blocked IP");
    });

    it("should block hostname resolving to fc00:: IPv6 (ULA)", async () => {
      mockResolve4.mockRejectedValue(new Error("ENOTFOUND"));
      mockResolve6.mockResolvedValue(["fc00::1"]);

      const result = await resolveWebhookIps("ipv6-ula.example.com");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Blocked IP");
      expect(result.error).toContain("fc00::1");
    });

    it("should block hostname resolving to fe80:: IPv6 (link-local)", async () => {
      mockResolve4.mockRejectedValue(new Error("ENOTFOUND"));
      mockResolve6.mockResolvedValue(["fe80::1"]);

      const result = await resolveWebhookIps("ipv6-linklocal.example.com");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Blocked IP");
    });

    it("should block hostname resolving to ::1 IPv6 (loopback)", async () => {
      mockResolve4.mockRejectedValue(new Error("ENOTFOUND"));
      mockResolve6.mockResolvedValue(["::1"]);

      const result = await resolveWebhookIps("ipv6-loopback.example.com");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Blocked IP");
    });
  });

  describe("edge cases", () => {
    it("should reject empty string hostname (both DNS fail)", async () => {
      mockResolve4.mockRejectedValue(new Error("ENOTFOUND"));
      mockResolve6.mockRejectedValue(new Error("ENOTFOUND"));

      const result = await resolveWebhookIps("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Cannot resolve hostname");
    });

    it("should handle hostname with trailing dot", async () => {
      mockResolve4.mockResolvedValue(["93.184.216.34"]);

      const result = await resolveWebhookIps("example.com.");
      expect(result.valid).toBe(true);
      expect(result.ips).toEqual(["93.184.216.34"]);
    });

    it("should lowercase uppercase hostname before resolution", async () => {
      mockResolve4.mockResolvedValue(["93.184.216.34"]);

      const result = await resolveWebhookIps("EXAMPLE.COM");
      expect(result.valid).toBe(true);
      expect(result.ips).toEqual(["93.184.216.34"]);
      // Verify the normalized (lowercased) hostname was passed to DNS
      expect(mockResolve4).toHaveBeenCalledWith("example.com");
    });
  });
});

// ────────────────────────────────────────────
// getClientIp
// ────────────────────────────────────────────

describe("getClientIp", () => {
  it("should extract the last valid IP from X-Forwarded-For (closest to server)", () => {
    const result = getClientIp({
      headers: new Headers({ "x-forwarded-for": "192.168.1.1, 10.0.0.1" }),
    });
    expect(result).toBe("10.0.0.1");
  });

  it("should return the last valid IP in chain", () => {
    const result = getClientIp({
      headers: new Headers({ "x-forwarded-for": "invalid, 8.8.8.8, 1.1.1.1" }),
    });
    expect(result).toBe("1.1.1.1");
  });

  it("should return 'unknown' when no X-Forwarded-For header", () => {
    const result = getClientIp({
      headers: new Headers(),
    });
    expect(result).toBe("unknown");
  });

  it("should handle Map-like headers", () => {
    const map = new Map<string, string>();
    map.set("x-forwarded-for", "10.0.0.1");
    const result = getClientIp({ headers: map as any });
    expect(result).toBe("10.0.0.1");
  });

  describe("header priority", () => {
    it("should prefer X-Real-IP over CF-Connecting-IP and X-Forwarded-For", () => {
      const result = getClientIp({
        headers: new Headers({
          "x-real-ip": "1.2.3.4",
          "cf-connecting-ip": "5.6.7.8",
          "x-forwarded-for": "9.9.9.9",
        }),
      });
      expect(result).toBe("1.2.3.4");
    });

    it("should prefer CF-Connecting-IP over X-Forwarded-For when X-Real-IP absent", () => {
      const result = getClientIp({
        headers: new Headers({
          "cf-connecting-ip": "5.6.7.8",
          "x-forwarded-for": "9.9.9.9",
        }),
      });
      expect(result).toBe("5.6.7.8");
    });

    it("should fall through to CF-Connecting-IP when X-Real-IP is invalid", () => {
      const result = getClientIp({
        headers: new Headers({
          "x-real-ip": "not-an-ip",
          "cf-connecting-ip": "5.6.7.8",
        }),
      });
      expect(result).toBe("5.6.7.8");
    });

    it("should fall through to X-Forwarded-For when X-Real-IP and CF-Connecting-IP are absent", () => {
      const result = getClientIp({
        headers: new Headers({
          "x-forwarded-for": "4.4.4.4",
        }),
      });
      expect(result).toBe("4.4.4.4");
    });

    it("should pick last valid IP from X-Forwarded-For chain (closest to server)", () => {
      const result = getClientIp({
        headers: new Headers({
          "x-forwarded-for": "203.0.113.1, 198.51.100.1, 192.0.2.1",
        }),
      });
      expect(result).toBe("192.0.2.1");
    });

    it("should handle X-Forwarded-For with a single IP", () => {
      const result = getClientIp({
        headers: new Headers({
          "x-forwarded-for": "8.8.8.8",
        }),
      });
      expect(result).toBe("8.8.8.8");
    });

    it("should handle X-Forwarded-For with IPv6 addresses", () => {
      const result = getClientIp({
        headers: new Headers({
          "x-forwarded-for": "2001:db8::1, 2001:db8::2",
        }),
      });
      expect(result).toBe("2001:db8::2");
    });

    it("should return 'unknown' when all X-Forwarded-For entries are invalid", () => {
      const result = getClientIp({
        headers: new Headers({
          "x-forwarded-for": "invalid, not-an-ip, also-bad",
        }),
      });
      expect(result).toBe("unknown");
    });

    it("should pick last valid IP when last entry in X-Forwarded-For is invalid", () => {
      const result = getClientIp({
        headers: new Headers({
          "x-forwarded-for": "8.8.8.8, 1.1.1.1, invalid",
        }),
      });
      expect(result).toBe("1.1.1.1");
    });

    it("should handle X-Forwarded-For with leading/trailing whitespace", () => {
      const result = getClientIp({
        headers: new Headers({
          "x-forwarded-for": "  8.8.8.8 ,  1.1.1.1  ",
        }),
      });
      expect(result).toBe("1.1.1.1");
    });

    it("should handle X-Forwarded-For with consecutive commas (empty entries)", () => {
      const result = getClientIp({
        headers: new Headers({
          "x-forwarded-for": "8.8.8.8,,,1.1.1.1",
        }),
      });
      expect(result).toBe("1.1.1.1");
    });

    it("should handle Map-like headers with X-Real-IP", () => {
      const map = new Map<string, string>();
      map.set("x-real-ip", "1.2.3.4");
      map.set("x-forwarded-for", "9.9.9.9");
      const result = getClientIp({ headers: map as any });
      expect(result).toBe("1.2.3.4");
    });

    it("should handle Map-like headers with CF-Connecting-IP fallback", () => {
      const map = new Map<string, string>();
      map.set("x-real-ip", "bad");
      map.set("cf-connecting-ip", "5.6.7.8");
      const result = getClientIp({ headers: map as any });
      expect(result).toBe("5.6.7.8");
    });

    it("should return 'unknown' when Map-like headers have no IP headers", () => {
      const map = new Map<string, string>();
      map.set("content-type", "application/json");
      const result = getClientIp({ headers: map as any });
      expect(result).toBe("unknown");
    });
  });

  describe("Map-like fallback path (typeof headers.get !== 'function')", () => {
    // Both Headers and Map have .get as a function, so the else branch
    // of `typeof req.headers.get === "function" ? ... : ...`
    // is never taken with normal objects. We use a Proxy that returns
    // undefined for the typeof check but provides a callable for the actual call.

    it("should fallback to Map-like path for X-Real-IP (branch coverage line 215)", () => {
      let accessCount = 0;
      const headers = new Proxy(
        { "x-real-ip": "1.2.3.4" },
        {
          get(target, prop) {
            if (prop === "get") {
              accessCount++;
              // Odd access = typeof check → return undefined to force else branch
              if (accessCount % 2 === 1) return undefined as any;
              // Even access = actual call → return working lookup function
              return (key: string) => (target as Record<string, string>)[key];
            }
            return (target as any)[prop];
          },
        },
      );

      const result = getClientIp({ headers: headers as any });
      expect(result).toBe("1.2.3.4");
    });

    it("should fallback to Map-like path for CF-Connecting-IP (branch coverage line 222)", () => {
      let accessCount = 0;
      const headers = new Proxy(
        { "cf-connecting-ip": "5.6.7.8" },
        {
          get(target, prop) {
            if (prop === "get") {
              accessCount++;
              if (accessCount % 2 === 1) return undefined as any;
              return (key: string) => (target as Record<string, string>)[key];
            }
            return (target as any)[prop];
          },
        },
      );

      const result = getClientIp({ headers: headers as any });
      expect(result).toBe("5.6.7.8");
    });

    it("should fallback to Map-like path for X-Forwarded-For (branch coverage line 229)", () => {
      let accessCount = 0;
      const headers = new Proxy(
        { "x-forwarded-for": "9.9.9.9" },
        {
          get(target, prop) {
            if (prop === "get") {
              accessCount++;
              if (accessCount % 2 === 1) return undefined as any;
              return (key: string) => (target as Record<string, string>)[key];
            }
            return (target as any)[prop];
          },
        },
      );

      const result = getClientIp({ headers: headers as any });
      expect(result).toBe("9.9.9.9");
    });

    it("should fallback to Map-like path and return 'unknown' when no headers exist", () => {
      let accessCount = 0;
      const headers = new Proxy(
        {},
        {
          get(target, prop) {
            if (prop === "get") {
              accessCount++;
              if (accessCount % 2 === 1) return undefined as any;
              return (key: string) => (target as Record<string, string>)[key];
            }
            return (target as any)[prop];
          },
        },
      );

      const result = getClientIp({ headers: headers as any });
      expect(result).toBe("unknown");
    });
  });
});
