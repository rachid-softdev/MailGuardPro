import { describe, expect, it, vi } from "vitest";

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn() },
}));

vi.mock("@/lib/logger", () => ({
  logger: mockLogger,
  loggerApi: mockLogger,
  loggerWebhook: mockLogger,
}));

import { createMetricsMiddleware, emitRequestMetric, trackApiRequest } from "@/lib/metrics";

const labels = { method: "GET", path: "/x", statusCode: 200, plan: "FREE" };

describe("metrics (P2)", () => {
  it("emitRequestMetric logs an api_request metric without throwing", () => {
    expect(() => emitRequestMetric({ labels, durationMs: 12 })).not.toThrow();
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ metric: "api_request" }),
      "RED metric",
    );
  });

  it("trackApiRequest returns the result and emits on success", async () => {
    const res = await trackApiRequest(async () => "ok", labels);
    expect(res).toBe("ok");
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ metric: "api_request" }),
      "RED metric",
    );
  });

  it("trackApiRequest emits an error metric and rethrows on failure", async () => {
    await expect(
      trackApiRequest(async () => {
        throw new Error("boom");
      }, labels),
    ).rejects.toThrow("boom");
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ metric: "api_error" }),
      "RED error metric",
    );
  });

  it("createMetricsMiddleware.finish emits error metric on failure", () => {
    const mw = createMetricsMiddleware(labels);
    mw.finish(500, new Error("x"));
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ metric: "api_error" }),
      "RED error metric",
    );
  });
});
