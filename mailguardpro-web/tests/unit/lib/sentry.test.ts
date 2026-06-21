import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Import the actual sentry module using relative path
import * as SentryModule from "@/lib/sentry";

const VALID_DSN = "https://key@org.ingest.sentry.io/project";

// Mock @sentry/nextjs
vi.mock("@sentry/nextjs", () => ({
  init: vi.fn(),
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  setUser: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

describe("sentry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("initSentry", () => {
    it("calls Sentry.init with DSN in production", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("SENTRY_DSN", VALID_DSN);

      SentryModule.initSentry();

      const Sentry = await import("@sentry/nextjs");
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: VALID_DSN,
          environment: "production",
          tracesSampleRate: 0.1,
          replaysSessionSampleRate: 0.1,
          replaysOnErrorSampleRate: 1.0,
        }),
      );
    });

    it("does NOT call Sentry.init in production without DSN", async () => {
      vi.stubEnv("NODE_ENV", "production");
      // SENTRY_DSN is not set

      SentryModule.initSentry();

      const Sentry = await import("@sentry/nextjs");
      expect(Sentry.init).not.toHaveBeenCalled();
    });

    it("does NOT call Sentry.init in development with DSN", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("SENTRY_DSN", VALID_DSN);

      SentryModule.initSentry();

      const Sentry = await import("@sentry/nextjs");
      expect(Sentry.init).not.toHaveBeenCalled();
    });

    it("does NOT call Sentry.init in test environment (default)", async () => {
      // NODE_ENV is "test" from vitest config, SENTRY_DSN not set by default
      vi.stubEnv("SENTRY_DSN", VALID_DSN);

      SentryModule.initSentry();

      const Sentry = await import("@sentry/nextjs");
      expect(Sentry.init).not.toHaveBeenCalled();
    });

    describe("beforeSend filter", () => {
      async function extractBeforeSend(): Promise<(event: any, hint: any) => any> {
        // initSentry must have been called first in production with DSN
        const Sentry = await import("@sentry/nextjs");
        const initOptions = Sentry.init.mock.calls[0][0];
        return initOptions.beforeSend;
      }

      it("returns null for TypeError with 'fetch' in message", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("SENTRY_DSN", VALID_DSN);

        SentryModule.initSentry();

        const beforeSend = await extractBeforeSend();
        const event = { event_id: "test" };
        const hint = { originalException: new TypeError("Failed to fetch") };

        const result = beforeSend(event, hint);
        expect(result).toBeNull();
      });

      it("returns event for non-fetch TypeError", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("SENTRY_DSN", VALID_DSN);

        SentryModule.initSentry();

        const beforeSend = await extractBeforeSend();
        const event = { event_id: "test" };
        const hint = {
          originalException: new TypeError("some other type error"),
        };

        const result = beforeSend(event, hint);
        expect(result).toBe(event);
      });

      it("returns event for regular Error", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("SENTRY_DSN", VALID_DSN);

        SentryModule.initSentry();

        const beforeSend = await extractBeforeSend();
        const event = { event_id: "test" };
        const hint = { originalException: new Error("Something went wrong") };

        const result = beforeSend(event, hint);
        expect(result).toBe(event);
      });

      it("returns event when originalException is undefined", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("SENTRY_DSN", VALID_DSN);

        SentryModule.initSentry();

        const beforeSend = await extractBeforeSend();
        const event = { event_id: "test" };
        const hint = {};

        const result = beforeSend(event, hint);
        expect(result).toBe(event);
      });
    });
  });

  describe("captureMessage", () => {
    it("calls Sentry.captureMessage in production", async () => {
      vi.stubEnv("NODE_ENV", "production");

      SentryModule.captureMessage("test message", "error", { key: "value" });

      const Sentry = await import("@sentry/nextjs");
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        "test message",
        expect.objectContaining({
          level: "error",
          extra: { key: "value" },
        }),
      );
    });

    it("does NOT call Sentry.captureMessage in development", async () => {
      vi.stubEnv("NODE_ENV", "development");

      SentryModule.captureMessage("test message");

      const Sentry = await import("@sentry/nextjs");
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    it("does NOT call Sentry.captureMessage in test environment (default)", async () => {
      SentryModule.captureMessage("test message");

      const Sentry = await import("@sentry/nextjs");
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    it("uses default level 'info' when not specified", async () => {
      vi.stubEnv("NODE_ENV", "production");

      SentryModule.captureMessage("test message");

      const Sentry = await import("@sentry/nextjs");
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        "test message",
        expect.objectContaining({
          level: "info",
        }),
      );
    });

    it("passes context as extra when provided", async () => {
      vi.stubEnv("NODE_ENV", "production");

      const context = { userId: "123", action: "test" };
      SentryModule.captureMessage("test", "warning", context);

      const Sentry = await import("@sentry/nextjs");
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        "test",
        expect.objectContaining({
          level: "warning",
          extra: context,
        }),
      );
    });
  });

  describe("captureException", () => {
    it("calls Sentry.captureException in production", async () => {
      vi.stubEnv("NODE_ENV", "production");

      const error = new Error("test error");
      SentryModule.captureException(error, { requestId: "123" });

      const Sentry = await import("@sentry/nextjs");
      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          extra: { requestId: "123" },
        }),
      );
    });

    it("does NOT call Sentry.captureException in development", async () => {
      vi.stubEnv("NODE_ENV", "development");

      SentryModule.captureException(new Error("test"));

      const Sentry = await import("@sentry/nextjs");
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it("calls Sentry.captureException without context in production", async () => {
      vi.stubEnv("NODE_ENV", "production");

      const error = new Error("test error");
      SentryModule.captureException(error);

      const Sentry = await import("@sentry/nextjs");
      expect(Sentry.captureException).toHaveBeenCalledWith(error, expect.objectContaining({}));
    });
  });

  describe("setUser", () => {
    it("calls Sentry.setUser with user object in production", async () => {
      vi.stubEnv("NODE_ENV", "production");

      const user = { id: "user-123", email: "test@example.com" };
      SentryModule.setUser(user);

      const Sentry = await import("@sentry/nextjs");
      expect(Sentry.setUser).toHaveBeenCalledWith(user);
    });

    it("does NOT call Sentry.setUser in development", async () => {
      vi.stubEnv("NODE_ENV", "development");

      SentryModule.setUser({ id: "123" });

      const Sentry = await import("@sentry/nextjs");
      expect(Sentry.setUser).not.toHaveBeenCalled();
    });

    it("calls Sentry.setUser with null in production", async () => {
      vi.stubEnv("NODE_ENV", "production");

      SentryModule.setUser(null);

      const Sentry = await import("@sentry/nextjs");
      expect(Sentry.setUser).toHaveBeenCalledWith(null);
    });

    it("calls Sentry.setUser with minimal user object (id only)", async () => {
      vi.stubEnv("NODE_ENV", "production");

      SentryModule.setUser({ id: "user-123" });

      const Sentry = await import("@sentry/nextjs");
      expect(Sentry.setUser).toHaveBeenCalledWith({ id: "user-123" });
    });
  });

  describe("addBreadcrumb", () => {
    it("calls Sentry.addBreadcrumb in production", async () => {
      vi.stubEnv("NODE_ENV", "production");

      SentryModule.addBreadcrumb("Test breadcrumb", "auth", "warning");

      const Sentry = await import("@sentry/nextjs");
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Test breadcrumb",
          category: "auth",
          level: "warning",
        }),
      );
    });

    it("does NOT call Sentry.addBreadcrumb in development", async () => {
      vi.stubEnv("NODE_ENV", "development");

      SentryModule.addBreadcrumb("Test");

      const Sentry = await import("@sentry/nextjs");
      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
    });

    it("uses default category 'general' and level 'info' when not specified", async () => {
      vi.stubEnv("NODE_ENV", "production");

      SentryModule.addBreadcrumb("Test breadcrumb");

      const Sentry = await import("@sentry/nextjs");
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Test breadcrumb",
          category: "general",
          level: "info",
        }),
      );
    });

    it("includes timestamp as a number in breadcrumb", async () => {
      vi.stubEnv("NODE_ENV", "production");

      SentryModule.addBreadcrumb("Test");

      const Sentry = await import("@sentry/nextjs");
      const callArg = Sentry.addBreadcrumb.mock.calls[0][0];
      expect(callArg).toHaveProperty("timestamp");
      expect(typeof callArg.timestamp).toBe("number");
    });
  });

  describe("default export", () => {
    it("is defined and is the @sentry/nextjs module (mocked)", async () => {
      const defaultExport = SentryModule.default;
      expect(defaultExport).toBeDefined();

      // It should at least have the mocked methods
      expect(typeof defaultExport.init).toBe("function");
      expect(typeof defaultExport.captureMessage).toBe("function");
    });
  });
});
