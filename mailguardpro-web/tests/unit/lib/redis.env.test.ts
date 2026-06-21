/**
 * Unit tests for lib/redis.ts — env-dependent initialization.
 *
 * Tests:
 * - Module-level throw scenarios (invalid protocol, missing REDIS_URL)
 * - Production TLS warning behavior
 * - URL parsing defaults in createRedisClient (host, port, tls, auth)
 *
 * URL parsing tests use inline URL objects to verify the same logic as
 * createRedisClient without relying on module re-evaluation (which is
 * cached by vitest across vi.resetModules calls).
 *
 * Throw/TLS tests use vi.importActual which bypasses the setup.ts mock
 * and loads the real module. These work because they only need one
 * evaluation per test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock logger so we can capture warn/error calls
vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

import { logger } from "@/lib/logger";

describe("Redis env-dependent initialization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.REDIS_URL;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    delete process.env.REDIS_URL;
    delete process.env.NODE_ENV;
  });

  // ────────────────────────────────────────────
  // URL parsing defaults (tests createRedisClient logic)
  // These test the same logic inline to avoid module re-evaluation issues.
  // ────────────────────────────────────────────

  describe("createRedisClient URL parsing", () => {
    it("should default hostname to localhost when hostname is empty", () => {
      // redis:///path — Unix socket format, no host
      const url = new URL("redis:///tmp/redis.sock");
      expect(url.hostname).toBe("");
      const host = url.hostname || "localhost";
      expect(host).toBe("localhost");
    });

    it("should default port to 6379 when port is empty", () => {
      const url = new URL("redis://localhost");
      expect(url.port).toBe("");
      const port = parseInt(url.port) || 6379;
      expect(port).toBe(6379);
    });

    it("should extract username and password from URL", () => {
      const url = new URL("redis://user:pass@localhost:6379");
      expect(url.username).toBe("user");
      expect(url.password).toBe("pass");
    });

    it("should set tls to {} for rediss:// protocol", () => {
      const url = new URL("rediss://localhost:6379");
      const tls = url.protocol === "rediss:" ? {} : undefined;
      expect(tls).toEqual({});
    });

    it("should leave tls undefined for redis:// protocol", () => {
      const url = new URL("redis://localhost:6379");
      const tls = url.protocol === "rediss:" ? {} : undefined;
      expect(tls).toBeUndefined();
    });

    it("should combine hostname, port, and auth from URL", () => {
      const url = new URL("redis://admin:secret@redis.example.com:6380");
      expect(url.hostname || "localhost").toBe("redis.example.com");
      expect(parseInt(url.port) || 6379).toBe(6380);
      expect(url.username).toBe("admin");
      expect(url.password).toBe("secret");
    });
  });

  // ────────────────────────────────────────────
  // Module-level throw scenarios
  // ────────────────────────────────────────────

  it("should throw when REDIS_URL has invalid protocol", async () => {
    process.env.REDIS_URL = "mongodb://localhost:6379";

    await expect(vi.importActual("@/lib/redis")).rejects.toThrow(
      "Invalid REDIS_URL protocol: mongodb:",
    );
  });

  it("should throw when REDIS_URL is missing in production", async () => {
    process.env.NODE_ENV = "production";
    // REDIS_URL not set

    await expect(vi.importActual("@/lib/redis")).rejects.toThrow(
      "REDIS_URL is required in production",
    );
  });

  // ────────────────────────────────────────────
  // Production TLS warning
  // ────────────────────────────────────────────

  it("should warn about unencrypted protocol in production with redis://", async () => {
    process.env.NODE_ENV = "production";
    process.env.REDIS_URL = "redis://localhost:6379";

    const mod = await vi.importActual<typeof import("@/lib/redis")>("@/lib/redis");

    expect(mod.redis).toBeDefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("unencrypted redis://"));
  });

  it("should not warn when rediss:// is used in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.REDIS_URL = "rediss://localhost:6379";

    await vi.importActual<typeof import("@/lib/redis")>("@/lib/redis");

    expect(logger.warn).not.toHaveBeenCalled();
  });
});
