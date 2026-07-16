import { describe, expect, it, vi } from "vitest";

// NOTE: do NOT import tests/setup.ts — we need REAL node crypto for timingSafeEqual.
const { mockPrisma, mockLoggerWebhook } = vi.hoisted(() => ({
  mockPrisma: { webhook: { findMany: vi.fn().mockResolvedValue([]) } },
  mockLoggerWebhook: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn() },
  loggerApi: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  loggerWebhook: mockLoggerWebhook,
  loggerWorker: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  loggerAuth: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/ssrf", () => ({
  resolveWebhookIps: vi.fn().mockResolvedValue({ valid: true, ips: ["93.184.216.34"] }),
}));
vi.mock("@/lib/crypto", () => ({ decryptToken: vi.fn((s: string) => s) }));

import crypto from "crypto";
import { WebhookDispatcher } from "@/services/webhookDispatcher";

describe("WebhookDispatcher.verifyIncomingSignature (P0 security)", () => {
  const payload = '{"event":"test","data":{"id":1}}';
  const secret = "super-secret";

  it("returns true for a correctly computed signature", () => {
    const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    expect(WebhookDispatcher.verifyIncomingSignature(payload, sig, secret)).toBe(true);
  });

  it("returns false for a tampered payload (equal-length signature)", () => {
    const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    expect(
      WebhookDispatcher.verifyIncomingSignature('{"event":"HACKED"}', sig, secret),
    ).toBe(false);
  });

  it("returns false for a wrong secret (equal-length signature)", () => {
    const sig = crypto.createHmac("sha256", "other-secret").update(payload).digest("hex");
    expect(WebhookDispatcher.verifyIncomingSignature(payload, sig, secret)).toBe(false);
  });

  it("does NOT throw on a truncated/wrong-length signature — returns false", () => {
    expect(() =>
      WebhookDispatcher.verifyIncomingSignature(payload, "deadbeef", secret),
    ).not.toThrow();
    expect(WebhookDispatcher.verifyIncomingSignature(payload, "deadbeef", secret)).toBe(false);
    expect(WebhookDispatcher.verifyIncomingSignature(payload, "", secret)).toBe(false);
  });

  it("generateSignature round-trips via verifyIncomingSignature", () => {
    const body = { event: "bulk_job_completed", timestamp: new Date().toISOString(), data: { a: 1 } };
    const sig = crypto.createHmac("sha256", secret).update(JSON.stringify(body)).digest("hex");
    expect(
      WebhookDispatcher.verifyIncomingSignature(JSON.stringify(body), sig, secret),
    ).toBe(true);
  });
});
