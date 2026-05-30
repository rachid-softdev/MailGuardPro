import { NextRequest } from "next/server";
/**
 * Unit tests for M-07 — Session revocation on API key delete.
 *
 * Verifies that the DELETE handler for /api/v1/api-keys/[id]:
 * - Calls prisma.$transaction with 3 operations
 * - Increments tokenVersion on the user
 * - Deletes all sessions for the user
 * - Returns success response
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks (module-level, hoisted before imports)
// ---------------------------------------------------------------------------

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
    apiKey: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
    session: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((ops: any[]) => Promise.all(ops)),
  },
}));

import { DELETE } from "@/app/api/v1/api-keys/[id]/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

describe("Session revocation on API key delete [M-07]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ────────────────────────────────────────────
  // $transaction with 3 operations
  // ────────────────────────────────────────────

  it("should call $transaction with 3 operations", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-key-1" },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as any);

    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
      id: "key-123",
      userId: "user-key-1",
      name: "Test Key",
      keyPrefix: "mg_live_abc1",
      scopes: "full",
      isActive: true,
    } as any);

    const url = new URL("http://localhost:3000/api/v1/api-keys/key-123");
    const req = new NextRequest(url, {
      method: "DELETE",
      headers: { origin: "http://localhost:3000" },
    });
    const params = Promise.resolve({ id: "key-123" });
    const response = await DELETE(req, { params } as any);

    expect(response.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    // Verify $transaction was called with an array of 3 operations
    const transactionArg = vi.mocked(prisma.$transaction).mock.calls[0][0];
    expect(Array.isArray(transactionArg)).toBe(true);
    expect(transactionArg).toHaveLength(3);
  });

  // ────────────────────────────────────────────
  // Operations: apiKey.update, user.update (tokenVersion), session.deleteMany
  // ────────────────────────────────────────────

  it("should call apiKey.update with isActive:false in transaction", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-key-2" },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as any);

    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
      id: "key-456",
      userId: "user-key-2",
      name: "Dev Key",
      keyPrefix: "mg_live_def2",
    } as any);

    const url = new URL("http://localhost:3000/api/v1/api-keys/key-456");
    const req = new NextRequest(url, {
      method: "DELETE",
      headers: { origin: "http://localhost:3000" },
    });
    const params = Promise.resolve({ id: "key-456" });
    await DELETE(req, { params } as any);

    expect(prisma.apiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "key-456" },
        data: { isActive: false },
      }),
    );
  });

  it("should increment tokenVersion on user update", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-key-3" },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as any);

    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
      id: "key-789",
      userId: "user-key-3",
      name: "CI Key",
    } as any);

    const url = new URL("http://localhost:3000/api/v1/api-keys/key-789");
    const req = new NextRequest(url, {
      method: "DELETE",
      headers: { origin: "http://localhost:3000" },
    });
    const params = Promise.resolve({ id: "key-789" });
    await DELETE(req, { params } as any);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-key-3" },
        data: { tokenVersion: { increment: 1 } },
      }),
    );
  });

  it("should delete all sessions for the user", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-key-4" },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as any);

    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
      id: "key-101",
      userId: "user-key-4",
      name: "Staging Key",
    } as any);

    const url = new URL("http://localhost:3000/api/v1/api-keys/key-101");
    const req = new NextRequest(url, {
      method: "DELETE",
      headers: { origin: "http://localhost:3000" },
    });
    const params = Promise.resolve({ id: "key-101" });
    await DELETE(req, { params } as any);

    expect(prisma.session.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-key-4" },
      }),
    );
  });

  // ────────────────────────────────────────────
  // Success response
  // ────────────────────────────────────────────

  it("should return success message mentioning session invalidation", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-key-5" },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as any);

    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
      id: "key-202",
      userId: "user-key-5",
      name: "Prod Key",
    } as any);

    const url = new URL("http://localhost:3000/api/v1/api-keys/key-202");
    const req = new NextRequest(url, {
      method: "DELETE",
      headers: { origin: "http://localhost:3000" },
    });
    const params = Promise.resolve({ id: "key-202" });
    const response = await DELETE(req, { params } as any);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain("All sessions invalidated");
  });

  // ────────────────────────────────────────────
  // Error handling
  // ────────────────────────────────────────────

  it("should return 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    const url = new URL("http://localhost:3000/api/v1/api-keys/key-303");
    const req = new NextRequest(url, {
      method: "DELETE",
      headers: { origin: "http://localhost:3000" },
    });
    const params = Promise.resolve({ id: "key-303" });
    const response = await DELETE(req, { params } as any);

    expect(response.status).toBe(401);
  });

  it("should return 404 when key not found or not owned by user", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-other" },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as any);

    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue(null);

    const url = new URL("http://localhost:3000/api/v1/api-keys/key-404");
    const req = new NextRequest(url, {
      method: "DELETE",
      headers: { origin: "http://localhost:3000" },
    });
    const params = Promise.resolve({ id: "key-404" });
    const response = await DELETE(req, { params } as any);

    expect(response.status).toBe(404);
  });
});
