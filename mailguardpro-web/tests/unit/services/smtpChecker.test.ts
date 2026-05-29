import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted helpers – available before vi.mock factories run
// ---------------------------------------------------------------------------
const { MockSocket, mockResolveMx, mockResolve4, mockResolve6 } = vi.hoisted(() => {
  class MockSocket {
    static nextResponses: string[] = [];
    static shouldTimeout = false;

    private handlers: Record<string, Array<(...args: any[]) => void>> = {};
    private responses: string[] = [];
    private responseIndex = 0;

    constructor() {
      this.responses = [...MockSocket.nextResponses];
      this.responseIndex = 0;
    }

    on(event: string, handler: (...args: any[]) => void) {
      if (!this.handlers[event]) this.handlers[event] = [];
      this.handlers[event].push(handler);

      // If a 'data' listener is registered and we have a response queued,
      // deliver it synchronously.  The listener in readResponse() will
      // resolve the promise and clear the timeout immediately.
      if (event === "data" && this.responseIndex < this.responses.length) {
        const chunk = this.responses[this.responseIndex++];
        handler(Buffer.from(chunk));
      }
    }

    connect(_port: number, host?: string) {
      // Set remoteAddress so connectWithResolvedIp rebinding check passes
      this.remoteAddress = host;

      // Fire the event synchronously so connectWithTimeout resolves
      // within the same Promise executor.
      if (MockSocket.shouldTimeout) {
        const timeoutHandlers = this.handlers["timeout"];
        if (timeoutHandlers) {
          for (const h of timeoutHandlers) h();
        }
      } else {
        const connectHandlers = this.handlers["connect"];
        if (connectHandlers) {
          for (const h of connectHandlers) h();
        }
      }
    }

    write(_data: string, encoding?: any, cb?: (err?: Error) => void) {
      const callback = typeof encoding === "function" ? encoding : cb;
      if (typeof callback === "function") {
        callback();
      }
    }

    destroy() {
      /* no-op */
    }
    setTimeout() {
      /* no-op */
    }
    removeAllListeners() {
      /* no-op */
    }
    setEncoding() {
      /* no-op */
    }
  }

  return {
    MockSocket,
    mockResolveMx: vi.fn(),
    mockResolve4: vi.fn(),
    mockResolve6: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("dns/promises", () => ({
  __esModule: true,
  default: {
    resolveMx: mockResolveMx,
    resolve4: mockResolve4,
    resolve6: mockResolve6,
  },
  resolveMx: mockResolveMx,
  resolve4: mockResolve4,
  resolve6: mockResolve6,
}));

vi.mock("net", () => ({
  __esModule: true,
  default: {
    Socket: MockSocket,
  },
  Socket: MockSocket,
}));

vi.mock("@/lib/redis", () => ({
  default: {
    get: vi.fn(),
    setex: vi.fn(),
  },
  redis: {
    get: vi.fn(),
    setex: vi.fn(),
  },
}));

vi.mock("@/lib/ssrf", () => ({
  validateResolvedIp: vi.fn(),
}));

import { validateResolvedIp } from "@/lib/ssrf";
// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------
import { checkSMTP } from "@/services/smtpChecker";
import dns from "dns/promises";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("checkSMTP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Speed up randomDelay() –  Math.random() returns 0 → delay = 100 ms
    vi.spyOn(Math, "random").mockReturnValue(0);
    // Reset socket static state
    MockSocket.nextResponses = [];
    MockSocket.shouldTimeout = false;
    // Default: resolved IP passes SSRF validation
    vi.mocked(validateResolvedIp).mockReturnValue({ valid: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Basic validation (no DNS / SMTP needed)
  // -----------------------------------------------------------------------
  it("should reject emails with invalid format", async () => {
    const result = await checkSMTP("not-an-email");

    expect(result.passed).toBe(false);
    expect(result.weight).toBe(30);
  });

  it("should reject emails with missing domain", async () => {
    const result = await checkSMTP("test@");

    expect(result.passed).toBe(false);
    expect(result.weight).toBe(30);
  });

  // -----------------------------------------------------------------------
  // DNS-level failures (SMTP never attempted)
  // -----------------------------------------------------------------------
  it("should return not-passed when domain has no MX records", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue([]);

    const result = await checkSMTP("user@nodomain.com");

    expect(result.passed).toBe(false);
    expect(result.message).toBe("SMTP: no MX record");
  });

  it("should return not-passed when MX resolution fails", async () => {
    vi.mocked(dns.resolveMx).mockRejectedValue(new Error("ENOTFOUND"));

    const result = await checkSMTP("user@invalid.com");

    expect(result.passed).toBe(false);
    expect(result.message).toBe("SMTP: domain not resolved");
  });

  // -----------------------------------------------------------------------
  // Successful SMTP handshake → mailbox exists
  // -----------------------------------------------------------------------
  it("should pass when full SMTP dialogue succeeds (RCPT 250)", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue([{ priority: 10, exchange: "mx.example.com" }]);
    vi.mocked(dns.resolve4).mockResolvedValue(["192.0.2.1"]);

    MockSocket.nextResponses = [
      "220 mx.example.com ESMTP ready\r\n",
      "250-mx.example.com at your service\r\n250 SMTPUTF8\r\n",
      "250 Sender OK\r\n",
      "250 Recipient OK\r\n",
    ];

    const result = await checkSMTP("user@example.com");

    expect(result.passed).toBe(true);
    expect(result.code).toBe("250");
    expect(result.message).toBe("Email deliverable");
  });

  // -----------------------------------------------------------------------
  // SMTP dialogue – mailbox not found (550)
  // -----------------------------------------------------------------------
  it("should fail when RCPT TO returns 550 (mailbox not found)", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue([{ priority: 10, exchange: "mx.example.com" }]);
    vi.mocked(dns.resolve4).mockResolvedValue(["192.0.2.1"]);

    MockSocket.nextResponses = [
      "220 mx.example.com ESMTP ready\r\n",
      "250-mx.example.com at your service\r\n250 SMTPUTF8\r\n",
      "250 Sender OK\r\n",
      "550 5.1.1 Mailbox not found\r\n",
    ];

    const result = await checkSMTP("missing@example.com");

    expect(result.passed).toBe(false);
    expect(result.code).toBe("550");
    expect(result.message).toBe("Mailbox does not exist");
  });

  // -----------------------------------------------------------------------
  // SMTP dialogue – 553 transient / 451-452 greylisting
  // -----------------------------------------------------------------------
  it("should fail with code 553 when address is invalid", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue([{ priority: 10, exchange: "mx.example.com" }]);
    vi.mocked(dns.resolve4).mockResolvedValue(["192.0.2.1"]);

    MockSocket.nextResponses = [
      "220 mx.example.com ESMTP ready\r\n",
      "250-mx.example.com at your service\r\n250 SMTPUTF8\r\n",
      "250 Sender OK\r\n",
      "553 5.1.3 Invalid address\r\n",
    ];

    const result = await checkSMTP("bad@example.com");

    expect(result.passed).toBe(false);
    expect(result.code).toBe("553");
    expect(result.message).toBe("Invalid address");
  });

  it("should fail with code 452 when server temporarily unavailable", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue([{ priority: 10, exchange: "mx.example.com" }]);
    vi.mocked(dns.resolve4).mockResolvedValue(["192.0.2.1"]);

    MockSocket.nextResponses = [
      "220 mx.example.com ESMTP ready\r\n",
      "250-mx.example.com at your service\r\n250 SMTPUTF8\r\n",
      "250 Sender OK\r\n",
      "452 4.2.2 Over quota\r\n",
    ];

    const result = await checkSMTP("quota@example.com");

    expect(result.passed).toBe(false);
    expect(result.code).toBe("452");
    expect(result.message).toBe("Server temporarily unavailable");
  });

  // -----------------------------------------------------------------------
  // Connection timeout – never reaches SMTP dialogue
  // -----------------------------------------------------------------------
  it("should fail when connection times out", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue([{ priority: 10, exchange: "mx.example.com" }]);
    vi.mocked(dns.resolve4).mockResolvedValue(["192.0.2.1"]);

    MockSocket.shouldTimeout = true;

    const result = await checkSMTP("user@slow-server.com");

    expect(result.passed).toBe(false);
    expect(result.message).toBe("SMTP: connection failed");
    expect(result.detail).toContain("SMTP connection timeout");
  });

  // -----------------------------------------------------------------------
  // Non-220 banner – server refuses connection
  // -----------------------------------------------------------------------
  it("should fail when server returns non-220 banner", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue([{ priority: 10, exchange: "mx.example.com" }]);
    vi.mocked(dns.resolve4).mockResolvedValue(["192.0.2.1"]);

    MockSocket.nextResponses = ["500 5.3.3 Unrecognized command\r\n"];

    const result = await checkSMTP("user@weird-server.com");

    expect(result.passed).toBe(false);
    expect(result.message).toBe("SMTP: server refused connection");
    expect(result.detail).toContain("500");
  });

  // -----------------------------------------------------------------------
  // Sender rejected – MAIL FROM returned non-250
  // -----------------------------------------------------------------------
  it("should fail when MAIL FROM is rejected", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue([{ priority: 10, exchange: "mx.example.com" }]);
    vi.mocked(dns.resolve4).mockResolvedValue(["192.0.2.1"]);

    MockSocket.nextResponses = [
      "220 mx.example.com ESMTP ready\r\n",
      "250-mx.example.com at your service\r\n250 SMTPUTF8\r\n",
      "550 5.7.1 Sender rejected\r\n",
    ];

    const result = await checkSMTP("user@example.com");

    expect(result.passed).toBe(false);
    expect(result.message).toBe("SMTP: sender rejected");
    expect(result.detail).toContain("550");
  });

  // -----------------------------------------------------------------------
  // IPv4 resolution fails, falls back to IPv6 which succeeds
  // -----------------------------------------------------------------------
  it("should fall back to IPv6 when IPv4 fails", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue([{ priority: 10, exchange: "mx.example.com" }]);
    vi.mocked(dns.resolve4).mockRejectedValue(new Error("ENOTFOUND"));
    vi.mocked(dns.resolve6).mockResolvedValue(["2001:db8::1"]);

    MockSocket.nextResponses = [
      "220 mx.example.com ESMTP ready\r\n",
      "250-mx.example.com at your service\r\n250 SMTPUTF8\r\n",
      "250 Sender OK\r\n",
      "250 Recipient OK\r\n",
    ];

    const result = await checkSMTP("user@example.com");

    expect(result.passed).toBe(true);
    expect(dns.resolve4).toHaveBeenCalledTimes(1);
    expect(dns.resolve6).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Both IPv4 and IPv6 fail
  // -----------------------------------------------------------------------
  it("should fail when MX hostname cannot be resolved to any IP", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue([{ priority: 10, exchange: "mx.example.com" }]);
    vi.mocked(dns.resolve4).mockRejectedValue(new Error("ENOTFOUND"));
    vi.mocked(dns.resolve6).mockRejectedValue(new Error("ENOTFOUND"));

    const result = await checkSMTP("user@unreachable.com");

    expect(result.passed).toBe(false);
    expect(result.message).toBe("SMTP: MX resolution failed");
  });

  // -----------------------------------------------------------------------
  // SSRF validation blocks IP
  // -----------------------------------------------------------------------
  it("should fail when resolved IP fails SSRF validation", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue([{ priority: 10, exchange: "mx.internal.com" }]);
    vi.mocked(dns.resolve4).mockResolvedValue(["10.0.0.1"]);
    // This IP is private → SSRF block
    vi.mocked(validateResolvedIp).mockReturnValue({
      valid: false,
      error: "Blocked private IP range: 10.0.0.1",
    });

    const result = await checkSMTP("user@internal.com");

    expect(result.passed).toBe(false);
    expect(result.message).toBe("SMTP: server not allowed");
  });

  // -----------------------------------------------------------------------
  // Uncertain status – RCPT returns an unexpected code
  // -----------------------------------------------------------------------
  it("should return not-passed for unknown RCPT response codes", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue([{ priority: 10, exchange: "mx.example.com" }]);
    vi.mocked(dns.resolve4).mockResolvedValue(["192.0.2.1"]);

    MockSocket.nextResponses = [
      "220 mx.example.com ESMTP ready\r\n",
      "250-mx.example.com at your service\r\n250 SMTPUTF8\r\n",
      "250 Sender OK\r\n",
      "450 4.1.1 Mailbox busy\r\n",
    ];

    const result = await checkSMTP("user@example.com");

    expect(result.passed).toBe(false);
    expect(result.message).toBe("Uncertain status");
  });

  // -----------------------------------------------------------------------
  // MX records sorted by priority, lowest used
  // -----------------------------------------------------------------------
  it("should connect to the lowest-priority MX server", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue([
      { priority: 30, exchange: "mx3.example.com" },
      { priority: 10, exchange: "mx1.example.com" },
      { priority: 20, exchange: "mx2.example.com" },
    ]);
    vi.mocked(dns.resolve4).mockResolvedValue(["192.0.2.1"]);

    MockSocket.nextResponses = [
      "220 mx1.example.com ESMTP ready\r\n",
      "250-mx1.example.com at your service\r\n250 SMTPUTF8\r\n",
      "250 Sender OK\r\n",
      "250 Recipient OK\r\n",
    ];

    const result = await checkSMTP("user@example.com");

    // Should have resolved only the lowest-priority MX
    expect(vi.mocked(dns.resolve4)).toHaveBeenCalledWith("mx1.example.com");
    expect(result.passed).toBe(true);
  });
});
