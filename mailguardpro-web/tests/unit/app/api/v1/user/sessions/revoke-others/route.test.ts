import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth, mockCsrf, mockLogAudit, mockPrisma, mockLoggerApi } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCsrf: vi.fn(() => ({ valid: true, error: undefined })),
  mockLogAudit: vi.fn(),
  mockPrisma: { session: { deleteMany: vi.fn() } },
  mockLoggerApi: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: mockCsrf }));
vi.mock("@/services/auditLogger", () => ({
  AuditAction: { SESSION_FORCED_INVALIDATION: "session_forced_invalidation" },
  AuditResource: { SESSION: "Session" },
  logAudit: mockLogAudit,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn() },
  loggerApi: mockLoggerApi,
}));

import { POST } from "@/app/api/v1/user/sessions/revoke-others/route";

function req(cookie?: string) {
  return new NextRequest("https://mailguardpro.com/api/v1/user/sessions/revoke-others", {
    method: "POST",
    headers: cookie ? { cookie } : undefined,
  });
}

describe("POST /api/v1/user/sessions/revoke-others", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCsrf.mockReturnValue({ valid: true, error: undefined });
    mockPrisma.session.deleteMany.mockResolvedValue({ count: 2 });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(req("next-auth.session-token=tok-current"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when CSRF origin invalid", async () => {
    mockCsrf.mockReturnValue({ valid: false, error: "CSRF" });
    const res = await POST(req("next-auth.session-token=tok-current"));
    expect(res.status).toBe(403);
  });

  it("returns 400 when the current session cookie is missing", async () => {
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(mockPrisma.session.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes all sessions except the current one and audits the count", async () => {
    const res = await POST(req("next-auth.session-token=tok-current"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.revokedCount).toBe(2);
    expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", sessionToken: { not: "tok-current" } },
    });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "session_forced_invalidation",
        resource: "Session",
        userId: "u1",
        metadata: expect.objectContaining({ scope: "others", revokedCount: 2 }),
      }),
    );
  });

  it("does not audit when there is nothing to revoke", async () => {
    mockPrisma.session.deleteMany.mockResolvedValue({ count: 0 });
    const res = await POST(req("next-auth.session-token=tok-current"));
    const body = await res.json();
    expect(body.revokedCount).toBe(0);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("returns 500 on unexpected error", async () => {
    mockPrisma.session.deleteMany.mockRejectedValue(new Error("db down"));
    const res = await POST(req("next-auth.session-token=tok-current"));
    expect(res.status).toBe(500);
  });
});
