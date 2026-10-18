import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuth,
  mockCsrf,
  mockRateLimit,
  mockLogAudit,
  mockPrisma,
  mockLoggerApi,
  mockEncryptToken,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCsrf: vi.fn(() => ({ valid: true, error: undefined })),
  mockRateLimit: vi.fn(() => ({ success: true, resetAt: Date.now() + 60000 })),
  mockLogAudit: vi.fn(),
  mockPrisma: {
    webhook: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
  mockLoggerApi: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  mockEncryptToken: vi.fn((s: string) => `enc:${s}`),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: mockCsrf }));
vi.mock("@/lib/rateLimits", () => ({ checkRateLimitByPlan: mockRateLimit, Plan: {} }));
vi.mock("@/lib/crypto", () => ({ encryptToken: mockEncryptToken, decryptToken: vi.fn() }));
vi.mock("@/services/auditLogger", () => ({
  AuditAction: { WEBHOOK_SECRET_REGENERATED: "webhook_secret_regenerated" },
  AuditResource: { WEBHOOK: "Webhook" },
  logAudit: mockLogAudit,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn() },
  loggerApi: mockLoggerApi,
  loggerWebhook: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { POST } from "@/app/api/v1/webhooks/[id]/regenerate-secret/route";

const WEBHOOK_ID = "w1";
const OWNED = { id: "w1", userId: "u1", name: "n", url: "https://x.com" };

function req() {
  return new NextRequest(
    `https://mailguardpro.com/api/v1/webhooks/${WEBHOOK_ID}/regenerate-secret`,
    { method: "POST" },
  );
}

describe("POST /api/v1/webhooks/[id]/regenerate-secret", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCsrf.mockReturnValue({ valid: true, error: undefined });
    mockRateLimit.mockReturnValue({ success: true, resetAt: Date.now() + 60000 });
    mockPrisma.webhook.findFirst.mockResolvedValue(OWNED);
    mockPrisma.webhook.update.mockResolvedValue({});
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(req(), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when CSRF origin invalid", async () => {
    mockCsrf.mockReturnValue({ valid: false, error: "CSRF" });
    const res = await POST(req(), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockRateLimit.mockReturnValue({ success: false, resetAt: Date.now() + 1000 });
    const res = await POST(req(), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(res.status).toBe(429);
  });

  it("returns 404 when webhook belongs to another user (IDOR guard)", async () => {
    mockPrisma.webhook.findFirst.mockResolvedValue(null);
    const res = await POST(req(), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(res.status).toBe(404);
    expect(mockPrisma.webhook.update).not.toHaveBeenCalled();
  });

  it("only looks up non-soft-deleted webhooks", async () => {
    await POST(req(), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(mockPrisma.webhook.findFirst).toHaveBeenCalledWith({
      where: { id: WEBHOOK_ID, userId: "u1", deletedAt: null },
    });
  });

  it("stores the encrypted new secret, returns the raw secret once, and audits", async () => {
    const res = await POST(req(), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.data.rawSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(body.data.rawSecretPrefix).toBe(body.data.rawSecret.slice(0, 4));
    expect(body.warning).toMatch(/shown only once/i);

    expect(mockEncryptToken).toHaveBeenCalledWith(body.data.rawSecret);
    expect(mockPrisma.webhook.update).toHaveBeenCalledWith({
      where: { id: WEBHOOK_ID },
      data: { encryptedSecret: `enc:${body.data.rawSecret}` },
    });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "webhook_secret_regenerated",
        resource: "Webhook",
        resourceId: WEBHOOK_ID,
        userId: "u1",
      }),
    );
  });

  it("generates a different secret on each call", async () => {
    const first = await (await POST(req(), { params: Promise.resolve({ id: WEBHOOK_ID }) })).json();
    const second = await (
      await POST(req(), { params: Promise.resolve({ id: WEBHOOK_ID }) })
    ).json();
    expect(first.data.rawSecret).not.toBe(second.data.rawSecret);
  });

  it("returns 500 on unexpected error", async () => {
    mockPrisma.webhook.update.mockRejectedValue(new Error("db down"));
    const res = await POST(req(), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(res.status).toBe(500);
  });
});
