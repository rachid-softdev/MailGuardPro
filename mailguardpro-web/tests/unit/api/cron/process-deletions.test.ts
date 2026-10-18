import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockVerifyCronRequest, mockPrisma, mockLogAudit } = vi.hoisted(() => ({
  mockVerifyCronRequest: vi.fn(),
  mockPrisma: {
    deletionSchedule: {
      findMany: vi.fn(),
    },
    validation: {
      deleteMany: vi.fn(),
    },
    scheduledExport: {
      deleteMany: vi.fn(),
    },
    user: {
      delete: vi.fn(),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
  mockLogAudit: vi.fn(),
}));

vi.mock("@/lib/cronAuth", () => ({
  verifyCronRequest: mockVerifyCronRequest,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/services/auditLogger", () => ({
  AuditAction: { USER_DELETED: "USER_DELETED" },
  AuditResource: { USER: "User" },
  logAudit: mockLogAudit,
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
  loggerApi: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/cron/process-deletions/route";

function cronReq(): NextRequest {
  return new NextRequest("http://localhost:3000/api/cron/process-deletions", {
    method: "GET",
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

describe("GET /api/cron/process-deletions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyCronRequest.mockResolvedValue({ authorized: true });
    mockPrisma.deletionSchedule.findMany.mockResolvedValue([]);
    // Each op returns a unique marker to assert the transaction op order
    mockPrisma.validation.deleteMany.mockReturnValue("op:validation");
    mockPrisma.scheduledExport.deleteMany.mockReturnValue("op:scheduledExport");
    mockPrisma.user.delete.mockReturnValue("op:userDelete");
  });

  it("returns the cron auth error response when unauthorized", async () => {
    const { NextResponse } = await import("next/server");
    const unauthorized = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    mockVerifyCronRequest.mockResolvedValue({ authorized: false, response: unauthorized });

    const res = await GET(cronReq());

    expect(res.status).toBe(401);
    expect(mockPrisma.deletionSchedule.findMany).not.toHaveBeenCalled();
  });

  it("does nothing when no schedule has expired", async () => {
    const res = await GET(cronReq());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(expect.objectContaining({ success: true, processed: 0, failed: 0 }));
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("deletes validations, scheduled exports, then the user (cascade) in one transaction", async () => {
    mockPrisma.deletionSchedule.findMany.mockResolvedValue([{ userId: "user-del-1" }]);

    const res = await GET(cronReq());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(expect.objectContaining({ success: true, processed: 1, failed: 0 }));

    // Order matters: explicit cleanup happens before user.delete cascades
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    const ops = mockPrisma.$transaction.mock.calls[0][0];
    expect(ops).toEqual(["op:validation", "op:scheduledExport", "op:userDelete"]);

    expect(mockPrisma.validation.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-del-1" },
    });
    expect(mockPrisma.scheduledExport.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-del-1" },
    });
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: "user-del-1" } });

    // Audit trail for the deleted account
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-del-1",
        action: "USER_DELETED",
        resource: "User",
        resourceId: "user-del-1",
      }),
    );
  });

  it("continues with other schedules when one account deletion fails", async () => {
    mockPrisma.deletionSchedule.findMany.mockResolvedValue([
      { userId: "user-fail" },
      { userId: "user-ok" },
    ]);
    mockPrisma.validation.deleteMany.mockImplementation(
      ({ where }: any) => `op:val:${where.userId}`,
    );
    mockPrisma.scheduledExport.deleteMany.mockImplementation(
      ({ where }: any) => `op:exp:${where.userId}`,
    );
    mockPrisma.user.delete.mockImplementation(({ where }: any) => {
      if (where.id === "user-fail") return Promise.reject(new Error("FK restriction"));
      return `op:user:${where.id}`;
    });

    const res = await GET(cronReq());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(expect.objectContaining({ success: true, processed: 1, failed: 1 }));
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("still succeeds when the audit log write fails (non-fatal)", async () => {
    mockPrisma.deletionSchedule.findMany.mockResolvedValue([{ userId: "user-del-2" }]);
    mockLogAudit.mockRejectedValue(new Error("audit down"));

    const res = await GET(cronReq());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(expect.objectContaining({ success: true, processed: 1, failed: 0 }));
  });

  it("returns 500 when the schedule lookup fails", async () => {
    mockPrisma.deletionSchedule.findMany.mockRejectedValue(new Error("db down"));

    const res = await GET(cronReq());

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });
});
