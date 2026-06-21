import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loggerEdge } from "@/lib/logger-edge";

describe("loggerEdge", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("info", () => {
    it("calls console.log with [MailGuard] prefix", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      loggerEdge.info("test message");
      expect(spy).toHaveBeenCalledWith("[MailGuard]", "test message");
    });

    it("passes multiple arguments to console.log", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      loggerEdge.info("arg1", { key: "value" }, 42);
      expect(spy).toHaveBeenCalledWith("[MailGuard]", "arg1", { key: "value" }, 42);
    });
  });

  describe("warn", () => {
    it("calls console.warn with [MailGuard] prefix", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      loggerEdge.warn("test warning");
      expect(spy).toHaveBeenCalledWith("[MailGuard]", "test warning");
    });

    it("passes multiple arguments to console.warn", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      loggerEdge.warn("warning", "details");
      expect(spy).toHaveBeenCalledWith("[MailGuard]", "warning", "details");
    });
  });

  describe("error", () => {
    it("calls console.error with [MailGuard] prefix", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      loggerEdge.error("test error");
      expect(spy).toHaveBeenCalledWith("[MailGuard]", "test error");
    });

    it("serializes error objects passed as arguments", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("Something failed");
      loggerEdge.error(error);
      expect(spy).toHaveBeenCalledWith("[MailGuard]", error);
    });

    it("passes multiple arguments to console.error", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      loggerEdge.error("error", new Error("details"));
      expect(spy).toHaveBeenCalledWith("[MailGuard]", "error", new Error("details"));
    });
  });

  describe("debug", () => {
    it("calls console.debug with [MailGuard] prefix in development", () => {
      vi.stubEnv("NODE_ENV", "development");
      const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
      loggerEdge.debug("debug message");
      expect(spy).toHaveBeenCalledWith("[MailGuard]", "debug message");
    });

    it("does NOT call console.debug in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
      loggerEdge.debug("debug message");
      expect(spy).not.toHaveBeenCalled();
    });

    it("does NOT call console.debug in test environment (default)", () => {
      const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
      loggerEdge.debug("debug message");
      expect(spy).not.toHaveBeenCalled();
    });

    it("passes multiple arguments to console.debug in development", () => {
      vi.stubEnv("NODE_ENV", "development");
      const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
      loggerEdge.debug("debug", { detail: "info" });
      expect(spy).toHaveBeenCalledWith("[MailGuard]", "debug", { detail: "info" });
    });
  });
});
