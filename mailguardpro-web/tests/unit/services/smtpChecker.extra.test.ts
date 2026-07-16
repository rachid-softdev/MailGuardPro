import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted helpers
// ---------------------------------------------------------------------------
const { MockSocket, mockResolveMx, mockResolve4, mockResolve6 } = vi.hoisted(() => {
  class MockSocket {
    static nextResponses: string[] = [];
    static shouldTimeout = false;
    static failPort: number | null = null; // port that triggers connect timeout
    static suppressData = false; // when true, 'data' is never delivered
    remoteAddress?: string;

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
      if (event === "data" && !MockSocket.suppressData && this.responseIndex < this.responses.length) {
        const chunk = this.responses[this.responseIndex++];
        handler(Buffer.from(chunk));
      }
      return this;
    }

    connect(port: number, host?: string) {
      this.remoteAddress = host;
      const fire = (name: string) => {
        const hs = this.handlers[name];
        if (hs) hs.forEach((h) => h());
      };
      const shouldTimeout =
        MockSocket.shouldTimeout || (MockSocket.failPort !== null && port === MockSocket.failPort);
      if (shouldTimeout) fire("timeout");
      else fire("connect");
      return this;
    }

    write(_data: string, encoding?: any, cb?: (err?: Error) => void) {
      const callback = typeof encoding === "function" ? encoding : cb;
      if (typeof callback === "function") callback();
    }

    destroy() {}
    setTimeout() {}
    removeAllListeners() {}
    setEncoding() {}
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
  default: { resolveMx: mockResolveMx, resolve4: mockResolve4, resolve6: mockResolve6 },
  resolveMx: mockResolveMx,
  resolve4: mockResolve4,
  resolve6: mockResolve6,
}));

vi.mock("net", () => ({
  __esModule: true,
  default: { Socket: MockSocket },
  Socket: MockSocket,
}));

const { mockRedisGet, mockRedisSetex } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSetex: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  redis: { get: mockRedisGet, setex: mockRedisSetex },
}));

vi.mock("@/lib/ssrf", () => ({
  validateResolvedIp: vi.fn(),
}));

import dns from "dns/promises";
import { validateResolvedIp } from "@/lib/ssrf";
import { checkSMTP } from "@/services/smtpChecker";

const MX = (host = "mx.example.com") => [{ priority: 10, exchange: host }];
const OK_RESPONSES = [
  "220 mx.example.com ESMTP ready\r\n",
  "250-mx.example.com at your service\r\n250 SMTPUTF8\r\n",
  "250 Sender OK\r\n",
  "250 Recipient OK\r\n",
];

describe("checkSMTP — cache & error paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(0); // randomDelay -> 100ms
    MockSocket.nextResponses = [];
    MockSocket.shouldTimeout = false;
    MockSocket.failPort = null;
    MockSocket.suppressData = false;
    mockRedisGet.mockResolvedValue(null);
    mockRedisSetex.mockResolvedValue("OK");
    vi.mocked(validateResolvedIp).mockReturnValue({ valid: true });
  });

  afterEach(() => vi.restoreAllMocks());

  // P1-8: cache hit returns cached result without DNS/SMTP
  it("should return cached SMTP result without DNS/SMTP when Redis cache hit", async () => {
    const cached = { passed: true, weight: 30, message: "Email deliverable", code: "250" };
    mockRedisGet.mockResolvedValue(JSON.stringify(cached));
    const result = await checkSMTP("user@example.com");
    expect(result).toEqual(cached);
    expect(dns.resolveMx).not.toHaveBeenCalled();
  });

  // P1-10: resolve4 resolves to [] (not reject) -> no IP resolved
  it("should fail with 'SMTP: no IP resolved' when resolve4 returns empty array", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue(MX());
    vi.mocked(dns.resolve4).mockResolvedValue([]); // resolves (not rejects)
    vi.mocked(dns.resolve6).mockResolvedValue([]);
    const result = await checkSMTP("user@example.com");
    expect(result.passed).toBe(false);
    expect(result.message).toBe("SMTP: no IP resolved");
  });

  // P1-22: first IP fails SSRF -> immediate block (no fallback to 2nd IP)
  it("should block immediately when the first resolved IP fails SSRF validation", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue(MX());
    vi.mocked(dns.resolve4).mockResolvedValue(["10.0.0.1", "8.8.8.8", "1.1.1.1"]);
    vi.mocked(validateResolvedIp).mockImplementation((ip: string) => ({
      valid: ip !== "10.0.0.1",
    }));
    const result = await checkSMTP("user@example.com");
    expect(result.passed).toBe(false);
    expect(result.message).toBe("SMTP: server not allowed");
    // only the first IP is ever checked
    expect(validateResolvedIp).toHaveBeenCalledWith("10.0.0.1");
    expect(validateResolvedIp).not.toHaveBeenCalledWith("8.8.8.8");
  });

  // P1-9: port 25 fails (timeout), port 587 succeeds
  it("should fall back to port 587 when port 25 connection times out", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue(MX());
    vi.mocked(dns.resolve4).mockResolvedValue(["192.0.2.1"]);
    MockSocket.failPort = 25; // 25 times out, 587 connects
    MockSocket.nextResponses = OK_RESPONSES;
    const result = await checkSMTP("user@example.com");
    expect(result.passed).toBe(true);
    expect(result.code).toBe("250");
  });

  // P1-11: readResponse timeout -> propagated to outer catch -> "SMTP error"
  it("should return 'SMTP error' when the SMTP banner read times out", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue(MX());
    vi.mocked(dns.resolve4).mockResolvedValue(["192.0.2.1"]);
    MockSocket.suppressData = true; // never deliver banner
    MockSocket.failPort = null;
    const result = await checkSMTP("user@example.com", 50); // short timeout
    expect(result.passed).toBe(false);
    expect(result.message).toBe("SMTP error");
  });

  // P1-25: cacheSmtpResult swallows setex failure, still returns result
  it("should still return the result when the cache write (setex) fails", async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue([]); // no MX -> cacheSmtpResult called
    mockRedisSetex.mockRejectedValue(new Error("redis down"));
    const result = await checkSMTP("user@nodomain.com");
    expect(result.passed).toBe(false);
    expect(result.message).toBe("SMTP: no MX record");
  });
});
