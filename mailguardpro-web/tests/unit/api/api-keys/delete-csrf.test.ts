/**
 * Unit tests for DELETE /api/v1/api-keys/[id] — CSRF protection gate.
 * (Session-revocation transaction behavior is covered by sessionRevocation.test.ts)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/services/auditLogger", () => ({
  logAudit: vi.fn(),
  AuditAction: { API_KEY_REVOKED: "API_KEY_REVOKED" },
  AuditResource: { API_KEY: "ApiKey" },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: { findFirst: vi.fn(), update: vi.fn() },
    user: { update: vi.fn() },
    session: { deleteMany: vi.fn() },
    $transaction: vi.fn((ops: any[]) => Promise.all(ops)),
  },
}));

import { NextRequest } from "next/server";
import { DELETE } from "@/app/api/v1/api-keys/[id]/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

describe("DELETE /api/v1/api-keys/[id] — CSRF gate", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("returns 403 when Origin/Referer is missing (CSRF failure)", async () => {
    // No origin, no referer, no X-API-Key → validateCsrfOrigin must reject.
    const req = new NextRequest("http://localhost:3000/api/v1/api-keys/k-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "k-1" }) } as any);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Origin");
  });

  it("proceeds past CSRF when a valid same-origin header is present", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
      id: "k-2",
      userId: "u1",
      name: "Key",
    } as any);
    const req = new NextRequest("http://localhost:3000/api/v1/api-keys/k-2", {
      method: "DELETE",
      headers: { origin: "http://localhost:3000" },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "k-2" }) } as any);
    // 200 (revoked) or 401/404 depending on downstream — must NOT be CSRF 403
    expect(res.status).not.toBe(403);
  });
});
