import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth, mockCsrf, mockLogAudit, mockPrisma, mockLoggerApi } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCsrf: vi.fn(() => ({ valid: true, error: undefined })),
  mockLogAudit: vi.fn(),
  mockPrisma: { session: { findFirst: vi.fn(), delete: vi.fn() } },
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

import { DELETE } from "@/app/api/v1/user/sessions/[id]/route";

const SESSION_ID = "s2";
const OTHER = { id: "s2", userId: "u1", sessionToken: "tok-other" };

function req(cookie?: string) {
  return new NextRequest(`https://mailguardpro.com/api/v1/user/sessions/${SESSION_ID}`, {
    method: "DELETE",
    headers: cookie ? { cookie } : undefined,
  });
}

describe("DELETE /api/v1/user/sessions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockCsrf.mockReturnValue({ valid: true, error: undefined });
    mockPrisma.session.findFirst.mockResolvedValue(OTHER);
    mockPrisma.session.delete.mockResolvedValue({});
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(req("next-auth.session-token=tok-current"), {
      params: Promise.resolve({ id: SESSION_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when CSRF origin invalid", async () => {
    mockCsrf.mockReturnValue({ valid: false, error: "CSRF" });
    const res = await DELETE(req("next-auth.session-token=tok-current"), {
      params: Promise.resolve({ id: SESSION_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the session belongs to another user (IDOR guard)", async () => {
    mockPrisma.session.findFirst.mockResolvedValue(null);
    const res = await DELETE(req("next-auth.session-token=tok-current"), {
      params: Promise.resolve({ id: SESSION_ID }),
    });
    expect(res.status).toBe(404);
    expect(mockPrisma.session.delete).not.toHaveBeenCalled();
  });

  it("refuses to revoke the current session", async () => {
    mockPrisma.session.findFirst.mockResolvedValue({
      id: "s1",
      userId: "u1",
      sessionToken: "tok-current",
    });
    const res = await DELETE(req("next-auth.session-token=tok-current"), {
      params: Promise.resolve({ id: "s1" }),
    });
    expect(res.status).toBe(400);
    expect(mockPrisma.session.delete).not.toHaveBeenCalled();
  });

  it("deletes the session row and writes an audit log", async () => {
    const res = await DELETE(req("next-auth.session-token=tok-current"), {
      params: Promise.resolve({ id: SESSION_ID }),
    });
    expect(res.status).toBe(200);
    expect(mockPrisma.session.delete).toHaveBeenCalledWith({ where: { id: SESSION_ID } });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "session_forced_invalidation",
        resource: "Session",
        resourceId: SESSION_ID,
        userId: "u1",
      }),
    );
  });

  it("returns 500 on unexpected error", async () => {
    mockPrisma.session.delete.mockRejectedValue(new Error("db down"));
    const res = await DELETE(req("next-auth.session-token=tok-current"), {
      params: Promise.resolve({ id: SESSION_ID }),
    });
    expect(res.status).toBe(500);
  });
});
