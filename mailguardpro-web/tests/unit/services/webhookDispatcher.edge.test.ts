import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockFetch, mockLoggerWebhook, mockResolve, mockDecrypt } = vi.hoisted(() => ({
  mockPrisma: {
    webhook: { findMany: vi.fn().mockResolvedValue([]) },
    webhookDelivery: { create: vi.fn().mockResolvedValue({ id: "del-1" }) },
  },
  mockFetch: vi.fn(),
  mockLoggerWebhook: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  mockResolve: vi.fn().mockResolvedValue({ valid: true, ips: ["93.184.216.34"] }),
  mockDecrypt: vi.fn((s: string) => s),
}));

global.fetch = mockFetch;

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn() },
  loggerApi: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  loggerWebhook: mockLoggerWebhook,
  loggerWorker: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  loggerAuth: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/ssrf", () => ({ resolveWebhookIps: mockResolve }));
vi.mock("@/lib/crypto", () => ({ decryptToken: mockDecrypt }));

import { WebhookDispatcher } from "@/services/webhookDispatcher";

const baseWebhook = {
  id: "w1",
  url: "https://example.com/hook",
  secret: "s",
  encryptedSecret: "s",
  events: ["bulk_job_completed"],
  isActive: true,
  pinnedIps: ["93.184.216.34"],
};

describe("WebhookDispatcher.dispatch edge cases (P1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockResolve.mockResolvedValue({ valid: true, ips: ["93.184.216.34"] });
    mockDecrypt.mockImplementation((s: string) => s);
  });

  it("returns false when pinnedIps is undefined (no DNS pinning)", async () => {
    const result = await WebhookDispatcher.dispatch(
      { ...baseWebhook, pinnedIps: undefined },
      "bulk_job_completed",
      { x: 1 },
    );
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns false when DNS resolution reports invalid", async () => {
    mockResolve.mockResolvedValue({ valid: false, error: "resolution failed" });
    const result = await WebhookDispatcher.dispatch(baseWebhook, "bulk_job_completed", { x: 1 });
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("still dispatches (returns true) on DNS-rebinding mismatch in non-production", async () => {
    // NODE_ENV is "test" so the production block does not apply
    mockResolve.mockResolvedValue({ valid: true, ips: ["203.0.113.9"] });
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: "OK" } as any);

    const result = await WebhookDispatcher.dispatch(baseWebhook, "bulk_job_completed", { x: 1 });

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockLoggerWebhook.error).toHaveBeenCalledWith(
      expect.objectContaining({}),
      expect.stringContaining("DNS REBINDING"),
    );
  });
});

describe("WebhookDispatcher.dispatchToUser edge cases (P1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockDecrypt.mockImplementation((s: string) => s);
  });

  const makeWebhooks = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      ...baseWebhook,
      id: `w-${i}`,
      userId: "user-1",
      encryptedSecret: `secret-${i}`,
    }));

  it("processes more than 5 webhooks in concurrency batches and reports all successful", async () => {
    mockPrisma.webhook.findMany.mockResolvedValue(makeWebhooks(7));
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: "OK" } as any);

    const result = await WebhookDispatcher.dispatchToUser("user-1", "bulk_job_completed", { x: 1 });

    expect(result.total).toBe(7);
    expect(result.successful).toBe(7);
    expect(result.failed).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(7);
  });

  it("counts a rejected dispatch (e.g. corrupt secret) as failed, not successful", async () => {
    mockPrisma.webhook.findMany.mockResolvedValue(makeWebhooks(2));
    // decryptToken throws only for the second webhook's secret
    mockDecrypt.mockImplementation((s: string) => {
      if (s === "secret-1") throw new Error("corrupt secret");
      return s;
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: "OK" } as any);

    const result = await WebhookDispatcher.dispatchToUser("user-1", "bulk_job_completed", { x: 1 });

    expect(result.total).toBe(2);
    expect(result.successful).toBe(1);
    expect(result.failed).toBe(1);
  });
});
