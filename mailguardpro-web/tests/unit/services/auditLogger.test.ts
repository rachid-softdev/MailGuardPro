import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuditAction,
  AuditResource,
  getResourceAuditLogs,
  getUserAuditLogs,
  logAudit,
  logAuditEvent,
} from "@/services/auditLogger";

// Mock prisma to prevent real PrismaClient instantiation at import time
vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

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
          ipAddress: expect.stringMatching(/^[0-9a-f]{16}$/),
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

    it("should hash IP addresses before storing when IP_HASH_KEY is set", async () => {
      // Set IP_HASH_KEY so hashIp actually hashes (instead of returning raw IP)
      vi.stubEnv("IP_HASH_KEY", "test-ip-hash-key-for-audit");
      // Re-import with the env set
      vi.resetModules();
      const {
        logAuditEvent: logAuditEventWithHash,
        AuditAction: AA,
        AuditResource: AR,
      } = await import("@/services/auditLogger");

      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: "1" } as any);

      await logAuditEventWithHash({
        action: AA.USER_LOGIN,
        resource: AR.USER,
        userId: "user-123",
        ipAddress: "203.0.113.42",
      });

      // Verify the stored ipAddress is NOT the raw IP (it should be hashed)
      const callArg = vi.mocked(prisma.auditLog.create).mock.calls[0][0];
      expect(callArg.data.ipAddress).not.toBe("203.0.113.42");
      // Should still be defined
      expect(callArg.data.ipAddress).toBeDefined();
      expect(typeof callArg.data.ipAddress).toBe("string");

      vi.unstubAllEnvs();
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
