import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuth,
  mockCsrf,
  mockRateLimit,
  mockParseJsonBody,
  mockValidateWebhookUrlWithDns,
  mockLogAudit,
  mockPrisma,
  mockLoggerApi,
  mockEncrypt,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCsrf: vi.fn(() => ({ valid: true, error: undefined })),
  mockRateLimit: vi.fn(() => ({ success: true, resetAt: Date.now() + 60000 })),
  mockParseJsonBody: vi.fn(() => ({ data: {}, error: undefined })),
  mockValidateWebhookUrlWithDns: vi.fn(() => ({ valid: true, resolvedIps: ["1.2.3.4"] })),
  mockLogAudit: vi.fn(),
  mockPrisma: {
    webhook: {
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
  },
  mockLoggerApi: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  mockEncrypt: vi.fn((s: string) => `enc:${s}`),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: mockCsrf }));
vi.mock("@/lib/rateLimits", () => ({ checkRateLimitByPlan: mockRateLimit, Plan: {} }));
vi.mock("@/lib/request", () => ({ parseJsonBody: mockParseJsonBody }));
vi.mock("@/lib/ssrf", () => ({ validateWebhookUrlWithDns: mockValidateWebhookUrlWithDns }));
vi.mock("@/lib/crypto", () => ({
  encryptToken: mockEncrypt,
  decryptToken: vi.fn((s: string) => s),
}));
vi.mock("@/services/auditLogger", () => ({
  AuditAction: { WEBHOOK_CREATED: "webhook_created" },
  AuditResource: { WEBHOOK: "Webhook" },
  logAudit: mockLogAudit,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn() },
  loggerApi: mockLoggerApi,
  loggerWebhook: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET, POST } from "@/app/api/v1/webhooks/route";

const BASE = "http://localhost:3000";

function postReq(body: unknown) {
  return new NextRequest(`${BASE}/api/v1/webhooks`, {
    method: "POST",
    headers: { origin: BASE },
    body: JSON.stringify(body),
  });
}

describe("GET /api/v1/webhooks (P0 secret-leak)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(new NextRequest(`${BASE}/api/v1/webhooks`));
    expect(res.status).toBe(401);
  });

  it("never leaks the encrypted secret or raw secret in the response", async () => {
    mockPrisma.webhook.findMany.mockResolvedValue([
      {
        id: "w1",
        url: "https://x.com/h",
        name: "n",
        events: ["bulk_job_completed"],
        isActive: true,
        createdAt: new Date(),
      },
    ]);
    const res = await GET(new NextRequest(`${BASE}/api/v1/webhooks`));
    expect(res.status).toBe(200);
    // The controller must only SELECT non-sensitive fields (no secret columns)
    expect(mockPrisma.webhook.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({
          encryptedSecret: expect.anything(),
          secret: expect.anything(),
          rawSecret: expect.anything(),
        }),
      }),
    );
    const body = await res.json();
    const row = body.data[0];
    expect(row).not.toHaveProperty("encryptedSecret");
    expect(row).not.toHaveProperty("secret");
    expect(row).not.toHaveProperty("rawSecret");
  });
});

describe("POST /api/v1/webhooks (P0/P1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCsrf.mockReturnValue({ valid: true, error: undefined });
    mockRateLimit.mockReturnValue({ success: true, resetAt: Date.now() + 60000 });
    mockValidateWebhookUrlWithDns.mockReturnValue({ valid: true, resolvedIps: ["1.2.3.4"] });
    mockPrisma.webhook.count.mockResolvedValue(0);
    mockPrisma.webhook.create.mockResolvedValue({
      id: "w1",
      url: "https://x.com/h",
      name: "n",
      events: ["bulk_job_completed"],
      isActive: true,
      createdAt: new Date(),
      encryptedSecret: "enc:gen",
    });
    mockParseJsonBody.mockReturnValue({
      data: { url: "https://x.com/h", name: "n", events: ["bulk_job_completed"] },
      error: undefined,
    });
  });

  it("returns 403 when CSRF origin invalid", async () => {
    mockCsrf.mockReturnValue({ valid: false, error: "CSRF" });
    const res = await POST(postReq({ url: "https://x.com/h", name: "n", events: ["a"] }));
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockRateLimit.mockReturnValue({ success: false, resetAt: Date.now() + 1000 });
    const res = await POST(postReq({ url: "https://x.com/h", name: "n", events: ["a"] }));
    expect(res.status).toBe(429);
  });

  it("returns 400 when name is missing", async () => {
    mockParseJsonBody.mockReturnValue({
      data: { url: "https://x.com/h", events: ["a"] },
      error: undefined,
    });
    const res = await POST(postReq({ url: "https://x.com/h", events: ["a"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when events is not an array", async () => {
    mockParseJsonBody.mockReturnValue({
      data: { url: "https://x.com/h", name: "n", events: "not-array" },
      error: undefined,
    });
    const res = await POST(postReq({ url: "https://x.com/h", name: "n", events: "x" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when SSRF resolves no IPs", async () => {
    mockValidateWebhookUrlWithDns.mockReturnValue({ valid: true, resolvedIps: [] });
    const res = await POST(postReq({ url: "https://x.com/h", name: "n", events: ["a"] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("no IPs resolved");
  });

  it("creates a webhook and returns 201 with rawSecretPrefix", async () => {
    const res = await POST(postReq({ url: "https://x.com/h", name: "n", events: ["a"] }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toHaveProperty("rawSecretPrefix");
    expect(body.data.rawSecretPrefix.length).toBe(4);
  });
});
