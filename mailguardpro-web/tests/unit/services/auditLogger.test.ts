import {
  AuditAction,
  AuditResource,
  getResourceAuditLogs,
  getUserAuditLogs,
  logAudit,
  logAuditEvent,
} from "@/services/auditLogger";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("auditLogger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("logAuditEvent", () => {
    it("should create audit log entry", async () => {
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: "1" } as any);

      await logAuditEvent({
        action: AuditAction.USER_LOGIN,
        resource: AuditResource.USER,
        userId: "user-123",
        ipAddress: "192.168.1.1",
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: "user-123",
          action: AuditAction.USER_LOGIN,
          resource: AuditResource.USER,
          ipAddress: "192.168.1.1",
          userAgent: undefined,
          metadata: undefined,
        },
      });
    });

    it("should include metadata in audit log", async () => {
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: "1" } as any);

      await logAuditEvent({
        action: AuditAction.API_KEY_CREATED,
        resource: AuditResource.API_KEY,
        userId: "user-123",
        metadata: { keyName: "Test Key", permissions: ["read"] },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: { keyName: "Test Key", permissions: ["read"] },
          }),
        }),
      );
    });

    it("should not throw on database errors", async () => {
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.auditLog.create).mockRejectedValue(new Error("DB error"));

      // Should not throw
      await expect(
        logAuditEvent({
          action: AuditAction.USER_LOGIN,
          resource: AuditResource.USER,
        }),
      ).resolves.not.toThrow();
    });

    it("should include userAgent when provided", async () => {
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: "1" } as any);

      await logAuditEvent({
        action: AuditAction.USER_LOGIN,
        resource: AuditResource.USER,
        userId: "user-123",
        userAgent: "Mozilla/5.0",
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userAgent: "Mozilla/5.0",
          }),
        }),
      );
    });

    it("should include resourceId when provided", async () => {
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: "1" } as any);

      await logAuditEvent({
        action: AuditAction.WEBHOOK_TRIGGERED,
        resource: AuditResource.WEBHOOK,
        resourceId: "webhook-123",
        userId: "user-123",
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            resourceId: "webhook-123",
          }),
        }),
      );
    });
  });

  describe("logAudit", () => {
    it("should call logAuditEvent without awaiting", async () => {
      const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // logAudit is fire-and-forget, so it should return immediately
      logAudit({
        action: AuditAction.BULK_JOB_CREATED,
        resource: AuditResource.BULK_JOB,
        userId: "user-123",
      });

      // Give it a moment to execute
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(logSpy).not.toHaveBeenCalled(); // No error, so no error log
      logSpy.mockRestore();
    });
  });

  describe("getUserAuditLogs", () => {
    it("should return audit logs for user", async () => {
      const { prisma } = await import("@/lib/prisma");
      const mockLogs = [{ id: "1", action: AuditAction.USER_LOGIN }] as any;
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue(mockLogs);

      const result = await getUserAuditLogs("user-123");

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { userId: "user-123" },
        orderBy: { createdAt: "desc" },
        take: 50,
        skip: 0,
      });
      expect(result).toEqual(mockLogs);
    });

    it("should filter by action when provided", async () => {
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);

      await getUserAuditLogs("user-123", { action: AuditAction.USER_LOGIN });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: AuditAction.USER_LOGIN,
          }),
        }),
      );
    });

    it("should filter by resource when provided", async () => {
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);

      await getUserAuditLogs("user-123", {
        resource: AuditResource.VALIDATION,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            resource: AuditResource.VALIDATION,
          }),
        }),
      );
    });

    it("should respect limit and offset", async () => {
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);

      await getUserAuditLogs("user-123", { limit: 10, offset: 20 });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        }),
      );
    });

    it("should use default limit of 50", async () => {
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);

      await getUserAuditLogs("user-123");

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        }),
      );
    });
  });

  describe("getResourceAuditLogs", () => {
    it("should return audit logs for resource", async () => {
      const { prisma } = await import("@/lib/prisma");
      const mockLogs = [{ id: "1", action: AuditAction.WEBHOOK_CREATED }] as any;
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue(mockLogs);

      const result = await getResourceAuditLogs(AuditResource.WEBHOOK, "webhook-123");

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          resource: AuditResource.WEBHOOK,
          resourceId: "webhook-123",
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        skip: 0,
      });
      expect(result).toEqual(mockLogs);
    });

    it("should respect limit and offset options", async () => {
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);

      await getResourceAuditLogs(AuditResource.BULK_JOB, "job-123", {
        limit: 20,
        offset: 10,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 10,
        }),
      );
    });
  });
});
