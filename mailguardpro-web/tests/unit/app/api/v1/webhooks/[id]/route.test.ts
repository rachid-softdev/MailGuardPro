import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuth,
  mockCsrf,
  mockRateLimit,
  mockParseJsonBody,
  mockValidateWebhookUrlWithDns,
  mockResolveWebhookIps,
  mockLogAudit,
  mockPrisma,
  mockLoggerApi,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCsrf: vi.fn(() => ({ valid: true, error: undefined })),
  mockRateLimit: vi.fn(() => ({ success: true, resetAt: Date.now() + 60000 })),
  mockParseJsonBody: vi.fn(() => ({ data: {}, error: undefined })),
  mockValidateWebhookUrlWithDns: vi.fn(() => ({ valid: true, resolvedIps: ["1.2.3.4"] })),
  mockResolveWebhookIps: vi.fn(() => ({ valid: true, ips: ["1.2.3.4"] })),
  mockLogAudit: vi.fn(),
  mockPrisma: {
    webhook: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
  mockLoggerApi: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: mockCsrf }));
vi.mock("@/lib/rateLimits", () => ({ checkRateLimitByPlan: mockRateLimit, Plan: {} }));
vi.mock("@/lib/request", () => ({ parseJsonBody: mockParseJsonBody }));
vi.mock("@/lib/ssrf", () => ({
  validateWebhookUrlWithDns: mockValidateWebhookUrlWithDns,
  resolveWebhookIps: mockResolveWebhookIps,
}));
vi.mock("@/services/auditLogger", () => ({
  AuditAction: { WEBHOOK_UPDATED: "webhook_updated", WEBHOOK_DELETED: "webhook_deleted" },
  AuditResource: { WEBHOOK: "Webhook" },
  logAudit: mockLogAudit,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn() },
  loggerApi: mockLoggerApi,
  loggerWebhook: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { DELETE, PATCH } from "@/app/api/v1/webhooks/[id]/route";

const OWNED = { id: "w1", userId: "u1", name: "n", url: "https://x.com", isActive: true };
const WEBHOOK_ID = "w1";
const BASE = "https://mailguardpro.com";

function req(method: string, body?: unknown) {
  return new NextRequest(`${BASE}/api/v1/webhooks/${WEBHOOK_ID}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("DELETE /api/v1/webhooks/[id] (P0/P1)", () => {
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
    const res = await DELETE(req("DELETE"), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when CSRF origin invalid", async () => {
    mockCsrf.mockReturnValue({ valid: false, error: "CSRF" });
    const res = await DELETE(req("DELETE"), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockRateLimit.mockReturnValue({ success: false, resetAt: Date.now() + 1000 });
    const res = await DELETE(req("DELETE"), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(res.status).toBe(429);
  });

  it("returns 404 when webhook belongs to another user (IDOR guard)", async () => {
    mockPrisma.webhook.findFirst.mockResolvedValue(null);
    const res = await DELETE(req("DELETE"), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(res.status).toBe(404);
    expect(mockPrisma.webhook.update).not.toHaveBeenCalled();
  });

  it("soft-deletes (sets deletedAt) and writes an audit log on success", async () => {
    const res = await DELETE(req("DELETE"), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(res.status).toBe(200);
    // PR #136: DELETE now performs a soft delete via prisma.webhook.update
    // (sets deletedAt) rather than a hard prisma.webhook.delete.
    expect(mockPrisma.webhook.update).toHaveBeenCalledWith({
      where: { id: WEBHOOK_ID },
      data: { deletedAt: expect.any(Date) },
    });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "webhook_deleted",
        resource: "Webhook",
        resourceId: WEBHOOK_ID,
        userId: "u1",
      }),
    );
  });

  it("returns 500 on unexpected error", async () => {
    mockPrisma.webhook.update.mockRejectedValue(new Error("db down"));
    const res = await DELETE(req("DELETE"), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/v1/webhooks/[id] (P0/P1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCsrf.mockReturnValue({ valid: true, error: undefined });
    mockRateLimit.mockReturnValue({ success: true, resetAt: Date.now() + 60000 });
    mockValidateWebhookUrlWithDns.mockReturnValue({ valid: true, resolvedIps: ["1.2.3.4"] });
    mockResolveWebhookIps.mockResolvedValue({ valid: true, ips: ["9.9.9.9"] });
    mockPrisma.webhook.findFirst.mockResolvedValue(OWNED);
    mockPrisma.webhook.update.mockResolvedValue({
      id: "w1",
      name: "new",
      url: "https://x.com",
      isActive: true,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(req("PATCH", {}), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when CSRF origin invalid", async () => {
    mockCsrf.mockReturnValue({ valid: false, error: "CSRF" });
    const res = await PATCH(req("PATCH", {}), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockRateLimit.mockReturnValue({ success: false, resetAt: Date.now() + 1000 });
    const res = await PATCH(req("PATCH", {}), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(res.status).toBe(429);
  });

  it("returns 404 when webhook belongs to another user (IDOR guard)", async () => {
    mockPrisma.webhook.findFirst.mockResolvedValue(null);
    const res = await PATCH(req("PATCH", {}), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(res.status).toBe(404);
    expect(mockPrisma.webhook.update).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid input (name too long)", async () => {
    mockParseJsonBody.mockReturnValue({ data: { name: "x".repeat(200) }, error: undefined });
    const res = await PATCH(req("PATCH", { name: "x".repeat(200) }), {
      params: Promise.resolve({ id: WEBHOOK_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("partially updates and writes an audit log on success", async () => {
    mockParseJsonBody.mockReturnValue({ data: { name: "new" }, error: undefined });
    const res = await PATCH(req("PATCH", { name: "new" }), {
      params: Promise.resolve({ id: WEBHOOK_ID }),
    });
    expect(res.status).toBe(200);
    expect(mockPrisma.webhook.update).toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "webhook_updated",
        resource: "Webhook",
        resourceId: WEBHOOK_ID,
        userId: "u1",
      }),
    );
  });

  it("re-pins IPs when the URL is updated", async () => {
    mockParseJsonBody.mockReturnValue({
      data: { url: "https://new.com" },
      error: undefined,
    });
    const res = await PATCH(req("PATCH", { url: "https://new.com" }), {
      params: Promise.resolve({ id: WEBHOOK_ID }),
    });
    expect(res.status).toBe(200);
    const updateArg = mockPrisma.webhook.update.mock.calls[0][0];
    expect(updateArg.data.pinnedIps).toContain("9.9.9.9");
    expect(updateArg.data.url).toBe("https://new.com");
  });

  it("returns 500 on unexpected error", async () => {
    mockParseJsonBody.mockReturnValue({ data: { name: "new" }, error: undefined });
    mockPrisma.webhook.update.mockRejectedValue(new Error("db down"));
    const res = await PATCH(req("PATCH", { name: "new" }), {
      params: Promise.resolve({ id: WEBHOOK_ID }),
    });
    expect(res.status).toBe(500);
  });
});
