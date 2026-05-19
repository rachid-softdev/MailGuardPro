import {
  createRequestLogger,
  logError,
  logRequest,
  logger,
  loggerApi,
  loggerAuth,
} from "@/lib/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("logger", () => {
    it("should be defined", () => {
      expect(logger).toBeDefined();
    });

    it("should have info method", () => {
      expect(typeof logger.info).toBe("function");
    });

    it("should have warn method", () => {
      expect(typeof logger.warn).toBe("function");
    });

    it("should have error method", () => {
      expect(typeof logger.error).toBe("function");
    });
  });

  describe("child loggers", () => {
    it("should have auth logger", () => {
      expect(loggerAuth).toBeDefined();
    });

    it("should have api logger", () => {
      expect(loggerApi).toBeDefined();
    });
  });

  describe("logRequest", () => {
    it("should not throw with valid request", () => {
      // Create a proper mock Request with headers.get()
      const req = {
        method: "GET",
        url: "/api/test",
        headers: new Headers({
          "user-agent": "test-agent",
          origin: "http://localhost",
        }),
      } as unknown as Request;

      expect(() => logRequest(req)).not.toThrow();
    });

    it("should accept request with response", () => {
      const req = {
        method: "POST",
        url: "/api/test",
        headers: new Headers({
          "user-agent": "test-agent",
        }),
      } as unknown as Request;
      const res = { status: 200 } as unknown as Response;

      expect(() => logRequest(req, res)).not.toThrow();
    });
  });

  describe("createRequestLogger", () => {
    it("should create request logger with headers", () => {
      const req = {
        method: "GET",
        url: "/api/test",
        headers: new Headers({
          "x-request-id": "test-id-123",
        }),
      } as unknown as Request;

      const result = createRequestLogger(req);
      expect(result).toBeDefined();
    });
  });

  describe("logError", () => {
    it("should log error without context", () => {
      const error = new Error("Test error");
      expect(() => logError(error)).not.toThrow();
    });

    it("should log error with context", () => {
      const error = new Error("Test error");
      expect(() => logError(error, { userId: "123" })).not.toThrow();
    });
  });
});
