import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuth,
  mockCsrf,
  mockValidateWebhookUrlWithDns,
  mockLogAuditUnused,
  mockPrisma,
  mockLoggerApi,
  mockDecrypt,
  mockFetch,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCsrf: vi.fn(() => ({ valid: true, error: undefined })),
  mockValidateWebhookUrlWithDns: vi.fn(() => ({ valid: true, resolvedIps: ["1.2.3.4"] })),
  mockLogAuditUnused: vi.fn(),
  mockPrisma: { webhook: { findFirst: vi.fn() } },
  mockLoggerApi: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  mockDecrypt: vi.fn((s: string) => s),
  mockFetch: vi.fn(),
}));

global.fetch = mockFetch;

vi.mock("@/lib/auth", () => ({ auth: mockAuth, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: mockCsrf }));
vi.mock("@/lib/ssrf", () => ({ validateWebhookUrlWithDns: mockValidateWebhookUrlWithDns }));
vi.mock("@/lib/crypto", () => ({ decryptToken: mockDecrypt }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn() },
  loggerApi: mockLoggerApi,
  loggerWebhook: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { POST } from "@/app/api/v1/webhooks/[id]/test/route";

const OWNED = { id: "w1", userId: "u1", url: "https://x.com", encryptedSecret: "enc" };
const WEBHOOK_ID = "w1";
const BASE = "https://mailguardpro.com";

function req() {
  return new NextRequest(`${BASE}/api/v1/webhooks/${WEBHOOK_ID}/test`, { method: "POST" });
}

describe("POST /api/v1/webhooks/[id]/test (P0/P1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCsrf.mockReturnValue({ valid: true, error: undefined });
    mockValidateWebhookUrlWithDns.mockReturnValue({ valid: true, resolvedIps: ["1.2.3.4"] });
    mockPrisma.webhook.findFirst.mockResolvedValue(OWNED);
    mockFetch.mockReset();
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

  it("returns 404 when webhook belongs to another user (IDOR guard)", async () => {
    mockPrisma.webhook.findFirst.mockResolvedValue(null);
    const res = await POST(req(), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(res.status).toBe(404);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 when SSRF validation blocks the target", async () => {
    mockValidateWebhookUrlWithDns.mockReturnValue({ valid: false, error: "Blocked" });
    const res = await POST(req(), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("blocked");
  });

  it("returns success with statusCode when the endpoint responds 200", async () => {
    mockFetch.mockResolvedValue({ status: 200, statusText: "OK" } as any);
    const res = await POST(req(), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.details.statusCode).toBe(200);
  });

  it("returns success:false (not a throw) when the fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await POST(req(), { params: Promise.resolve({ id: WEBHOOK_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("ECONNREFUSED");
  });
});
