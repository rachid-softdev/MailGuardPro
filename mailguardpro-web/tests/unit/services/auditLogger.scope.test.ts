import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockLogger } = vi.hoisted(() => ({
  mockPrisma: {
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
  mockLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({
  logger: mockLogger,
  loggerWebhook: mockLogger,
  loggerApi: mockLogger,
}));
vi.mock("@/lib/ipHash", () => ({ hashIp: vi.fn((ip: string) => `hash:${ip}`) }));

import { getResourceAuditLogs } from "@/services/auditLogger";

describe("getResourceAuditLogs cross-tenant scoping (P0 security)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
  });

  it("scopes results by userId when provided (prevents cross-tenant leak)", async () => {
    await getResourceAuditLogs("Webhook" as any, "res-1", { userId: "u1" });
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ resource: "Webhook", resourceId: "res-1", userId: "u1" }),
      }),
    );
  });

  it("does NOT include userId in the where clause when not provided (backward compatible)", async () => {
    await getResourceAuditLogs("Webhook" as any, "res-1");
    const where = mockPrisma.auditLog.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty("userId");
    expect(where).toEqual({ resource: "Webhook", resourceId: "res-1" });
  });

  it("applies default limit of 50", async () => {
    await getResourceAuditLogs("Webhook" as any, "res-1", { userId: "u1" });
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50, skip: 0 }),
    );
  });
});
