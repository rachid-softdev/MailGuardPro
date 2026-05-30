/**
 * Unit tests for services/smtpChecker.ts — normalizeIp and connectWithResolvedIp.
 *
 * Tests the DNS rebinding protection and IP normalization logic.
 *
 * These functions are internal but have been exported for testing.
 * We mock `net` only (avoid all other service mocks) to test connectWithResolvedIp
 * in isolation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted helpers — available before vi.mock factories run
// ---------------------------------------------------------------------------
const { MockSocket } = vi.hoisted(() => {
  // A minimal EventEmitter-like socket mock.
  // We fire connect/timeout synchronously from connect() to emulate net.Socket.
  class MockSocket {
    remoteAddress: string | undefined;
    private handlers: Record<string, Array<(...args: any[]) => void>> = {};
    private destroyed = false;
    setTimeoutMs = 0;
    connectedIp = "";
    connectPort = 0;

    on(event: string, handler: (...args: any[]) => void) {
      if (!this.handlers[event]) this.handlers[event] = [];
      this.handlers[event].push(handler);
      return this;
    }

    setTimeout(ms: number) {
      this.setTimeoutMs = ms;
      return this;
    }

    connect(port: number, ip?: string) {
      this.connectPort = port;
      // Capture the IP we're connecting to, to compare later
      this.connectedIp = ip || "";

      // Set remoteAddress immediately (simulates what net does after connect)
      this.remoteAddress = MockSocket._remoteAddressOverride ?? ip;

      // Fire events synchronously
      if (MockSocket._shouldTimeout) {
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
      return this;
    }

    destroy() {
      this.destroyed = true;
    }

    get destroyedFlag() {
      return this.destroyed;
    }

    removeAllListeners() {
      /* no-op for mock */
    }
    setEncoding() {
      /* no-op */
    }

    // Static controls for test scenarios
    static _remoteAddressOverride: string | undefined;
    static _shouldTimeout = false;
  }

  return { MockSocket };
});

// ---------------------------------------------------------------------------
// Module mocks — only mock net, no other deps needed for these functions
// ---------------------------------------------------------------------------
vi.mock("net", () => ({
  __esModule: true,
  default: {
    Socket: MockSocket,
  },
  Socket: MockSocket,
}));

// ---------------------------------------------------------------------------
// Subject under test — direct exports (normalizeIp, connectWithResolvedIp)
// ---------------------------------------------------------------------------
import { connectWithResolvedIp, normalizeIp } from "@/services/smtpChecker";

describe("normalizeIp", () => {
  it("should return IPv4 addresses unchanged", () => {
    expect(normalizeIp("192.168.1.1")).toBe("192.168.1.1");
    expect(normalizeIp("10.0.0.1")).toBe("10.0.0.1");
    expect(normalizeIp("203.0.113.42")).toBe("203.0.113.42");
  });

  it("should return IPv6 addresses unchanged", () => {
    expect(normalizeIp("2001:db8::1")).toBe("2001:db8::1");
    expect(normalizeIp("::1")).toBe("::1");
    expect(normalizeIp("fe80::1")).toBe("fe80::1");
  });

  it("should convert IPv4-mapped IPv6 (::ffff:x.x.x.x) to plain IPv4", () => {
    expect(normalizeIp("::ffff:192.168.1.1")).toBe("192.168.1.1");
    expect(normalizeIp("::ffff:10.0.0.5")).toBe("10.0.0.5");
    expect(normalizeIp("::ffff:203.0.113.99")).toBe("203.0.113.99");
  });

  it("should handle empty string", () => {
    expect(normalizeIp("")).toBe("");
  });

  it("should not modify non-::ffff: prefixed strings", () => {
    expect(normalizeIp("::abcd:10.0.0.1")).toBe("::abcd:10.0.0.1");
    expect(normalizeIp("random-ip")).toBe("random-ip");
  });
});

describe("connectWithResolvedIp", () => {
  beforeEach(() => {
    // Default: no timeout, remoteAddress matches
    MockSocket._remoteAddressOverride = undefined;
    MockSocket._shouldTimeout = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ────────────────────────────────────────────
  // Successful connection — IP matches
  // ────────────────────────────────────────────

  it("should resolve when socket.remoteAddress matches expected IP", async () => {
    MockSocket._remoteAddressOverride = "192.168.1.1";

    const socket = await connectWithResolvedIp("192.168.1.1", 25, 5000);
    expect(socket).toBeDefined();
    expect(socket.remoteAddress).toBe("192.168.1.1");
  });

  it("should resolve when IP is IPv6 and matches", async () => {
    MockSocket._remoteAddressOverride = "2001:db8::1";

    const socket = await connectWithResolvedIp("2001:db8::1", 25, 5000);
    expect(socket).toBeDefined();
  });

  it("should resolve when remoteAddress is IPv4-mapped IPv6 and expected IP is IPv4", async () => {
    // connectWithResolvedIp normalizes the remoteAddress
    // So ::ffff:10.0.0.1 → 10.0.0.1 (via normalizeIp), which matches "10.0.0.1"
    MockSocket._remoteAddressOverride = "::ffff:10.0.0.1";

    const socket = await connectWithResolvedIp("10.0.0.1", 25, 5000);
    expect(socket).toBeDefined();
  });

  it("should connect on the specified port", async () => {
    MockSocket._remoteAddressOverride = "203.0.113.1";

    const socket = await connectWithResolvedIp("203.0.113.1", 587, 5000);
    expect(socket).toBeDefined();
    // MockSocket stores the port used
    expect((socket as any).connectPort).toBe(587);
  });

  // ────────────────────────────────────────────
  // DNS rebinding detection — IP mismatch
  // ────────────────────────────────────────────

  it("should reject with DNS rebinding error when remoteAddress differs", async () => {
    // Socket connects to 10.0.0.1 but remoteAddress is 10.0.0.2
    MockSocket._remoteAddressOverride = "10.0.0.2";

    await expect(connectWithResolvedIp("10.0.0.1", 25, 5000)).rejects.toThrow(
      "DNS rebinding detected",
    );
  });

  it("should reject with correct expected/actual IP in error message", async () => {
    MockSocket._remoteAddressOverride = "192.168.1.99";

    await expect(connectWithResolvedIp("192.168.1.1", 25, 5000)).rejects.toThrow(
      "connected to 192.168.1.99, expected 192.168.1.1",
    );
  });

  it("should destroy the socket on DNS rebinding detection", async () => {
    MockSocket._remoteAddressOverride = "10.0.0.99";
    let destroyed = false;

    // Intercept destroy on the socket
    const origDestroy = MockSocket.prototype.destroy;
    MockSocket.prototype.destroy = function () {
      destroyed = true;
      return origDestroy.call(this);
    };

    try {
      await connectWithResolvedIp("10.0.0.1", 25, 5000);
    } catch {
      // expected
    }

    expect(destroyed).toBe(true);

    // Restore
    MockSocket.prototype.destroy = origDestroy;
  });

  it("should detect rebinding with IPv4-mapped IPv6 vs IPv4", async () => {
    // remoteAddress is ::ffff:10.0.0.2 (normalized to 10.0.0.2), expected is 10.0.0.1
    MockSocket._remoteAddressOverride = "::ffff:10.0.0.2";

    await expect(connectWithResolvedIp("10.0.0.1", 25, 5000)).rejects.toThrow(
      "DNS rebinding detected",
    );
  });

  // ────────────────────────────────────────────
  // Timeout handling
  // ────────────────────────────────────────────

  it("should reject with timeout error when connection times out", async () => {
    MockSocket._shouldTimeout = true;

    await expect(connectWithResolvedIp("192.168.1.1", 25, 5000)).rejects.toThrow(
      "SMTP connection timeout",
    );
  });

  it("should destroy the socket on timeout", async () => {
    MockSocket._shouldTimeout = true;
    let destroyed = false;

    const origDestroy = MockSocket.prototype.destroy;
    MockSocket.prototype.destroy = function () {
      destroyed = true;
      return origDestroy.call(this);
    };

    try {
      await connectWithResolvedIp("192.168.1.1", 25, 5000);
    } catch {
      // expected
    }

    expect(destroyed).toBe(true);
    MockSocket.prototype.destroy = origDestroy;
  });

  // ────────────────────────────────────────────
  // Error handling
  // ────────────────────────────────────────────

  it("should reject on socket error", async () => {
    // Simulate an error by not setting remoteAddress before connect fires.
    // The connect handler will see remoteAddress as undefined, which won't match
    // the expected IP, triggering the rebinding error.

    // Actually let's just trigger the 'error' event on the socket.
    // The connect handler won't be called if there's an error.
    MockSocket._remoteAddressOverride = undefined;

    // Modify the socket to emit 'error' on connect
    const origConnect = MockSocket.prototype.connect;
    MockSocket.prototype.connect = function (this: any, ...args: any[]) {
      const errorHandlers = this.handlers?.["error"];
      if (errorHandlers) {
        for (const h of errorHandlers) h(new Error("ECONNREFUSED"));
      }
      return this;
    };

    await expect(connectWithResolvedIp("127.0.0.1", 25, 5000)).rejects.toThrow("ECONNREFUSED");

    MockSocket.prototype.connect = origConnect;
  });

  it("should set socket timeout from parameter", async () => {
    MockSocket._remoteAddressOverride = "10.0.0.1";

    const socket = await connectWithResolvedIp("10.0.0.1", 25, 3000);
    expect((socket as any).setTimeoutMs).toBe(3000);
  });
});
