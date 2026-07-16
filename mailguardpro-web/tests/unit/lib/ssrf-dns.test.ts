/**
 * Additional unit tests for lib/ssrf.ts
 * - DNS-rebinding protection: domain resolving to 169.254.169.254 / 127.0.0.1 is blocked
 * - resolveWebhookIps() returns ips / blocks blocked IPs
 * - Decimal / hex IP encodings are treated as domains and caught at DNS-resolution stage
 * - getClientIp() trusts the LAST IP in the X-Forwarded-For chain
 */
import { describe, expect, it, vi } from "vitest";
import {
  getClientIp,
  resolveWebhookIps,
  validateWebhookUrl,
  validateWebhookUrlWithDns,
} from "@/lib/ssrf";

const { mockResolve4, mockResolve6 } = vi.hoisted(() => ({
  mockResolve4: vi.fn(),
  mockResolve6: vi.fn(),
}));

vi.mock("dns/promises", () => ({
  default: { resolve4: mockResolve4, resolve6: mockResolve6 },
  resolve4: mockResolve4,
  resolve6: mockResolve6,
}));

describe("validateWebhookUrlWithDns — DNS rebinding / SSRF", () => {
  it("blocks a domain that resolves to the cloud metadata IP 169.254.169.254", async () => {
    mockResolve4.mockResolvedValue(["169.254.169.254"]);
    mockResolve6.mockRejectedValue(new Error("ENOTFOUND"));

    const result = await validateWebhookUrlWithDns("https://metadata.example.com/hook");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("blocked IP");
  });

  it("blocks a domain that resolves to 127.0.0.1 (loopback via rebinding)", async () => {
    mockResolve4.mockResolvedValue(["127.0.0.1"]);
    mockResolve6.mockRejectedValue(new Error("ENOTFOUND"));

    const result = await validateWebhookUrlWithDns("https://internal.example.com/hook");
    expect(result.valid).toBe(false);
  });

  it("blocks a domain that resolves to a private 10.x IP", async () => {
    mockResolve4.mockResolvedValue(["10.0.0.5"]);
    mockResolve6.mockRejectedValue(new Error("ENOTFOUND"));

    const result = await validateWebhookUrlWithDns("https://app.example.com/hook");
    expect(result.valid).toBe(false);
  });

  it("allows a domain resolving to a public IP", async () => {
    mockResolve4.mockResolvedValue(["93.184.216.34"]);
    mockResolve6.mockRejectedValue(new Error("ENOTFOUND"));

    const result = await validateWebhookUrlWithDns("https://example.com/hook");
    expect(result.valid).toBe(true);
    expect(result.resolvedIps).toEqual(["93.184.216.34"]);
  });
});

describe("Decimal / hex IP encodings", () => {
  it("blocks decimal IP '2130706433' (WHATWG URL parser expands it to 127.0.0.1)", () => {
    // The WHATWG URL parser normalizes a bare decimal to its IPv4 form, so the
    // literal-IP / blocked-hostname guards catch it before any DNS lookup.
    const result = validateWebhookUrl("https://2130706433/hook");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not allowed");
  });

  it("blocks decimal-encoded IP at the URL stage (no DNS rebinding window)", async () => {
    const result = await validateWebhookUrlWithDns("https://2130706433/hook");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not allowed");
  });

  it("blocks hex-encoded IP '0x7f000001' (expands to 127.0.0.1)", async () => {
    const result = await validateWebhookUrlWithDns("https://0x7f000001/hook");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not allowed");
  });
});

describe("resolveWebhookIps", () => {
  it("returns resolved public IPs for a valid domain", async () => {
    mockResolve4.mockResolvedValue(["93.184.216.34"]);
    mockResolve6.mockRejectedValue(new Error("ENOTFOUND"));

    const result = await resolveWebhookIps("example.com");
    expect(result.valid).toBe(true);
    expect(result.ips).toEqual(["93.184.216.34"]);
  });

  it("blocks a domain resolving to a blocked IP", async () => {
    mockResolve4.mockResolvedValue(["169.254.169.254"]);
    mockResolve6.mockRejectedValue(new Error("ENOTFOUND"));

    const result = await resolveWebhookIps("metadata.example.com");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Blocked IP");
  });
});

describe("getClientIp — X-Forwarded-For trust model", () => {
  it("returns the LAST (server-closest) valid IP in the X-Forwarded-For chain", () => {
    const req = {
      headers: new Map<string, string>([
        ["x-forwarded-for", "203.0.113.7, 10.0.0.1, 192.168.1.50"],
      ]),
    };
    expect(getClientIp(req as any)).toBe("192.168.1.50");
  });

  it("prefers x-real-ip over x-forwarded-for", () => {
    const req = {
      headers: new Map<string, string>([
        ["x-real-ip", "198.51.100.23"],
        ["x-forwarded-for", "203.0.113.7, 192.168.1.50"],
      ]),
    };
    expect(getClientIp(req as any)).toBe("198.51.100.23");
  });

  it("prefers cf-connecting-ip when x-real-ip is absent", () => {
    const req = {
      headers: new Map<string, string>([["cf-connecting-ip", "198.51.100.99"]]),
    };
    expect(getClientIp(req as any)).toBe("198.51.100.99");
  });

  it("prefers x-real-ip over cf-connecting-ip (x-real-ip checked first)", () => {
    const req = {
      headers: new Map<string, string>([
        ["x-real-ip", "198.51.100.23"],
        ["cf-connecting-ip", "198.51.100.99"],
      ]),
    };
    expect(getClientIp(req as any)).toBe("198.51.100.23");
  });
});
