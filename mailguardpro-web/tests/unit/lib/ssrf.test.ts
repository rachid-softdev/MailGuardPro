import {
  getClientIp,
  validateResolvedIp,
  validateWebhookUrl,
  validateWebhookUrlWithDns,
} from "@/lib/ssrf";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    dns.default.resolve4.mockResolvedValue(["93.184.216.34"]);

    const result = await validateWebhookUrlWithDns("https://example.com/hook");
    expect(result.valid).toBe(true);
  });

  it("should return resolvedIps for a valid domain (M-1 fix)", async () => {
    const dns = await import("dns/promises");
    dns.default.resolve4.mockResolvedValue(["93.184.216.34", "93.184.216.35"]);

    const result = await validateWebhookUrlWithDns("https://example.com/hook");
    expect(result.valid).toBe(true);
    expect(result.resolvedIps).toBeDefined();
    expect(result.resolvedIps).toEqual(["93.184.216.34", "93.184.216.35"]);
  });

  it("should return resolvedIps with IPv6 fallback (M-1 fix)", async () => {
    const dns = await import("dns/promises");
    dns.default.resolve4.mockRejectedValue(new Error("ENOTFOUND"));
    dns.default.resolve6.mockResolvedValue(["2001:db8::1", "2001:db8::2"]);

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
    dns.default.resolve4.mockResolvedValue([]);
    dns.default.resolve6.mockRejectedValue(new Error("ENOTFOUND"));

    const result = await validateWebhookUrlWithDns("https://empty.example.com/hook");
    expect(result.valid).toBe(false);
    expect(result.resolvedIps).toBeUndefined();
  });

  it("should reject a domain that resolves to a private IP", async () => {
    const dns = await import("dns/promises");
    dns.default.resolve4.mockResolvedValue(["10.0.0.1"]);

    const result = await validateWebhookUrlWithDns("https://internal.example.com/hook");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("blocked IP");
  });

  it("should reject a domain that resolves to a loopback IP", async () => {
    const dns = await import("dns/promises");
    dns.default.resolve4.mockResolvedValue(["127.0.0.1"]);

    const result = await validateWebhookUrlWithDns("https://localhost-evil.com/hook");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("blocked IP");
  });

  it("should reject a domain that resolves to metadata IP", async () => {
    const dns = await import("dns/promises");
    dns.default.resolve4.mockResolvedValue(["169.254.169.254"]);

    const result = await validateWebhookUrlWithDns("https://metadata.evil.com/hook");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("blocked IP");
  });

  it("should fallback to IPv6 when IPv4 resolution fails", async () => {
    const dns = await import("dns/promises");
    dns.default.resolve4.mockRejectedValue(new Error("ENOTFOUND"));
    dns.default.resolve6.mockResolvedValue(["2001:db8::1"]);

    const result = await validateWebhookUrlWithDns("https://ipv6-only.example.com/hook");
    expect(result.valid).toBe(true);
  });

  it("should reject IPv6 fallback that resolves to private address", async () => {
    const dns = await import("dns/promises");
    dns.default.resolve4.mockRejectedValue(new Error("ENOTFOUND"));
    dns.default.resolve6.mockResolvedValue(["fc00::1"]);

    const result = await validateWebhookUrlWithDns("https://ipv6-private.example.com/hook");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("blocked IP");
  });

  it("should return failure when both IPv4 and IPv6 resolution fail", async () => {
    const dns = await import("dns/promises");
    dns.default.resolve4.mockRejectedValue(new Error("ENOTFOUND"));
    dns.default.resolve6.mockRejectedValue(new Error("ENOTFOUND"));

    const result = await validateWebhookUrlWithDns("https://unknown.example.com/hook");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Cannot resolve hostname");
  });

  it("should return failure when IPv4 returns empty and IPv6 fails", async () => {
    const dns = await import("dns/promises");
    dns.default.resolve4.mockResolvedValue([]);
    dns.default.resolve6.mockRejectedValue(new Error("ENOTFOUND"));

    const result = await validateWebhookUrlWithDns("https://empty.example.com/hook");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Cannot resolve hostname");
  });

  it("should handle DNS metadata hostname correctly", async () => {
    const result = await validateWebhookUrlWithDns("https://metadata.google.internal/hook");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Internal hostnames");
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
});
