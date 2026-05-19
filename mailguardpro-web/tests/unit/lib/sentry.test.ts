import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Import the actual sentry module using relative path
import * as SentryModule from "@/lib/sentry";

// Mock @sentry/nextjs
vi.mock("@sentry/nextjs", () => ({
  __esModule: true,
  default: {
    init: vi.fn(),
    captureMessage: vi.fn(),
    captureException: vi.fn(),
    setUser: vi.fn(),
    addBreadcrumb: vi.fn(),
  },
  init: vi.fn(),
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  setUser: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

describe("sentry", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe("initSentry", () => {
    it("should be a function", () => {
      expect(typeof SentryModule.initSentry).toBe("function");
    });

    it("should not throw in development", () => {
      process.env.NODE_ENV = "development";
      expect(() => SentryModule.initSentry()).not.toThrow();
    });

    it("should not throw without SENTRY_DSN", () => {
      process.env.NODE_ENV = "production";
      delete process.env.SENTRY_DSN;
      expect(() => SentryModule.initSentry()).not.toThrow();
    });

    it("should initialize in production with DSN", () => {
      process.env.NODE_ENV = "production";
      process.env.SENTRY_DSN = "https://test@sentry.io/123";
      expect(() => SentryModule.initSentry()).not.toThrow();
    });
  });

  describe("captureMessage", () => {
    it("should be a function", () => {
      expect(typeof SentryModule.captureMessage).toBe("function");
    });

    it("should not throw when called", () => {
      expect(() => SentryModule.captureMessage("test")).not.toThrow();
    });

    it("should accept message and level", () => {
      expect(() => SentryModule.captureMessage("test", "info")).not.toThrow();
    });

    it("should accept optional context", () => {
      expect(() => SentryModule.captureMessage("test", "error", { userId: "123" })).not.toThrow();
    });

    it("should call Sentry.captureMessage in production", async () => {
      process.env.NODE_ENV = "production";
      const Sentry = await import("@sentry/nextjs");
      SentryModule.captureMessage("test message", "error", { key: "value" });
      expect(Sentry.captureMessage).toHaveBeenCalled();
    });
  });

  describe("captureException", () => {
    it("should be a function", () => {
      expect(typeof SentryModule.captureException).toBe("function");
    });

    it("should not throw when called", () => {
      expect(() => SentryModule.captureException(new Error("test"))).not.toThrow();
    });

    it("should accept optional context", () => {
      const error = new Error("test");
      expect(() => SentryModule.captureException(error, { userId: "123" })).not.toThrow();
    });
  });

  describe("setUser", () => {
    it("should be a function", () => {
      expect(typeof SentryModule.setUser).toBe("function");
    });

    it("should accept null user", () => {
      expect(() => SentryModule.setUser(null)).not.toThrow();
    });

    it("should accept user object", () => {
      expect(() => SentryModule.setUser({ id: "123", email: "test@example.com" })).not.toThrow();
    });
  });

  describe("addBreadcrumb", () => {
    it("should be a function", () => {
      expect(typeof SentryModule.addBreadcrumb).toBe("function");
    });

    it("should accept message", () => {
      expect(() => SentryModule.addBreadcrumb("Test breadcrumb")).not.toThrow();
    });

    it("should accept optional category", () => {
      expect(() => SentryModule.addBreadcrumb("Test", "auth")).not.toThrow();
    });

    it("should accept optional level", () => {
      expect(() => SentryModule.addBreadcrumb("Test", "auth", "warning")).not.toThrow();
    });
  });

  describe("default export", () => {
    it("should export Sentry", () => {
      // The default export is the @sentry/nextjs module
      const Sentry = SentryModule.default;
      expect(Sentry).toBeDefined();
    });
  });
});
