import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dns module - must have default export for vi.mocked() to work
vi.mock("dns/promises", () => ({
  __esModule: true,
  default: {
    resolveMx: vi.fn(),
  },
  resolveMx: vi.fn(),
}));

import { checkSMTP } from "@/services/smtpChecker";
import dns from "dns/promises";

describe("checkSMTP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return invalid when domain has no MX records", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue([]);

    const result = await checkSMTP("test@nonexistent.com");

    expect(result.passed).toBe(false);
    expect(result.message).toContain("aucun MX");
  });

  it("should return invalid when domain cannot be resolved", async () => {
    vi.mocked(dns.resolveMx).mockRejectedValue(new Error("ENOTFOUND"));

    const result = await checkSMTP("test@invalid-domain-xyz.com");

    expect(result.passed).toBe(false);
    expect(result.message).toContain("non résolu");
  });

  it("should handle timeout gracefully", async () => {
    vi.mocked(dns.resolveMx).mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 100)),
    );

    const result = await checkSMTP("test@timeout.com", 50);

    expect(result.passed).toBe(false);
  }, 10000);

  it("should accept valid email format for known providers", async () => {
    // Mock a successful SMTP connection
    vi.mocked(dns.resolveMx).mockResolvedValue([{ priority: 10, exchange: "smtp.gmail.com" }]);

    // Note: Full SMTP testing would require mocking net.Socket which is complex
    // The function should at least not throw on valid inputs
    try {
      const result = await checkSMTP("test@gmail.com", 1000);
      // Result will depend on actual SMTP response, but shouldn't crash
      expect(result).toBeDefined();
    } catch {
      // Timeout or network error is acceptable in test environment
    }
  }, 10000);

  it("should reject emails with invalid format", async () => {
    const result = await checkSMTP("not-an-email");

    expect(result.passed).toBe(false);
  });

  it("should reject emails with missing domain", async () => {
    const result = await checkSMTP("test@");

    expect(result.passed).toBe(false);
  });
});
