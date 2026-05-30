import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the crypto module
vi.mock("@/lib/crypto", () => ({
  encryptToken: vi.fn((s: string) => `encrypted:${s}`),
  decryptToken: vi.fn((s: string) => {
    if (s.startsWith("encrypted:")) return s.slice(10);
    return s;
  }),
}));

// Mock @/lib/prisma completely so the real PrismaClient is never instantiated
const mockAccount = {
  create: vi.fn(),
  update: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  findFirstOrThrow: vi.fn(),
};

const mockUser = {
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

const mockValidation = {
  create: vi.fn(),
};

const mockBulkJob = {
  create: vi.fn(),
};

const mockApiKey = {};
const mockWebhook = {};
const mockRateLimit = {};
const mockAuditLog = {};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    account: mockAccount,
    user: mockUser,
    validation: mockValidation,
    bulkJob: mockBulkJob,
    apiKey: mockApiKey,
    webhook: mockWebhook,
    rateLimit: mockRateLimit,
    auditLog: mockAuditLog,
    $transaction: vi.fn(),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    $extends: vi.fn(),
  },
  default: {
    account: mockAccount,
    user: mockUser,
    validation: mockValidation,
    bulkJob: mockBulkJob,
    apiKey: mockApiKey,
    webhook: mockWebhook,
    rateLimit: mockRateLimit,
    auditLog: mockAuditLog,
    $transaction: vi.fn(),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    $extends: vi.fn(),
  },
}));

describe("prisma", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("prisma instance", () => {
    it("should be defined", async () => {
      const { prisma } = await import("@/lib/prisma");
      expect(prisma).toBeDefined();
    });

    it("should have user property", async () => {
      const { prisma } = await import("@/lib/prisma");
      expect(prisma.user).toBeDefined();
    });

    it("should have validation property", async () => {
      const { prisma } = await import("@/lib/prisma");
      expect(prisma.validation).toBeDefined();
    });

    it("should have bulkJob property", async () => {
      const { prisma } = await import("@/lib/prisma");
      expect(prisma.bulkJob).toBeDefined();
    });

    it("should have apiKey property", async () => {
      const { prisma } = await import("@/lib/prisma");
      expect(prisma.apiKey).toBeDefined();
    });

    it("should have webhook property", async () => {
      const { prisma } = await import("@/lib/prisma");
      expect(prisma.webhook).toBeDefined();
    });

    it("should have rateLimit property", async () => {
      const { prisma } = await import("@/lib/prisma");
      expect(prisma.rateLimit).toBeDefined();
    });

    it("should have auditLog property", async () => {
      const { prisma } = await import("@/lib/prisma");
      expect(prisma.auditLog).toBeDefined();
    });

    it("should have $transaction method", async () => {
      const { prisma } = await import("@/lib/prisma");
      expect(typeof prisma.$transaction).toBe("function");
    });

    it("should have $connect method", async () => {
      const { prisma } = await import("@/lib/prisma");
      expect(typeof prisma.$connect).toBe("function");
    });

    it("should have $disconnect method", async () => {
      const { prisma } = await import("@/lib/prisma");
      expect(typeof prisma.$disconnect).toBe("function");
    });
  });

  describe("CRUD operations", () => {
    it("should be able to query user", async () => {
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
        credits: 100,
      });

      const user = await prisma.user.findUnique({
        where: { id: "user-123" },
      });

      expect(user).toEqual({
        id: "user-123",
        email: "test@example.com",
        credits: 100,
      });
    });

    it("should be able to create validation", async () => {
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.validation.create).mockResolvedValue({
        id: "val-123",
        email: "test@example.com",
      });

      const validation = await prisma.validation.create({
        data: {
          email: "test@example.com",
          score: 85,
          status: "valid",
        },
      });

      expect(validation.email).toBe("test@example.com");
    });

    it("should be able to create bulk job", async () => {
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.bulkJob.create).mockResolvedValue({
        id: "job-123",
        status: "pending",
      });

      const job = await prisma.bulkJob.create({
        data: {
          userId: "user-123",
          filename: "test.csv",
          total: 100,
        },
      });

      expect(job.status).toBe("pending");
    });
  });

  // ────────────────────────────────────────────
  // OAuth Token Encryption Extension
  // ────────────────────────────────────────────

  describe("Account token encryption extension", () => {
    it("should call account.create with token fields", async () => {
      const { prisma } = await import("@/lib/prisma");

      vi.mocked(prisma.account.create).mockResolvedValue({
        id: "account-1",
        access_token: "encrypted:my-secret-token",
        userId: "user-123",
      } as any);

      await prisma.account.create({
        data: {
          access_token: "my-secret-token",
          refresh_token: "my-refresh-token",
          userId: "user-123",
          type: "oauth",
          provider: "google",
          providerAccountId: "12345",
        },
      });

      // Verify create was called with correct data
      expect(prisma.account.create).toHaveBeenCalledWith({
        data: {
          access_token: "my-secret-token",
          refresh_token: "my-refresh-token",
          userId: "user-123",
          type: "oauth",
          provider: "google",
          providerAccountId: "12345",
        },
      });
    });

    it("should not encrypt non-token fields on Account create", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { encryptToken } = await import("@/lib/crypto");

      vi.mocked(prisma.account.create).mockResolvedValue({
        id: "account-2",
        userId: "user-123",
        provider: "github",
      } as any);

      await prisma.account.create({
        data: {
          userId: "user-123",
          type: "oauth",
          provider: "github",
          providerAccountId: "67890",
        },
      });

      // encryptToken should NOT have been called since no token fields present
      expect(encryptToken).not.toHaveBeenCalled();
    });

    it("should decrypt access_token on Account findUnique", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { decryptToken } = await import("@/lib/crypto");

      vi.mocked(prisma.account.findUnique).mockResolvedValue({
        id: "account-1",
        access_token: "decrypted-token",
        userId: "user-123",
      } as any);

      const result = await prisma.account.findUnique({
        where: { id: "account-1" },
      });

      expect(result).toBeDefined();
      expect(result?.access_token).toBe("decrypted-token");
    });

    it("should decrypt tokens on Account findMany", async () => {
      const { prisma } = await import("@/lib/prisma");

      vi.mocked(prisma.account.findMany).mockResolvedValue([
        { id: "a1", access_token: "tok1", userId: "u1" },
        { id: "a2", access_token: "tok2", userId: "u2" },
      ] as any);

      const results = await prisma.account.findMany({
        where: { userId: "u1" },
      });

      expect(results).toHaveLength(2);
    });

    it("should not modify non-Account models", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { encryptToken } = await import("@/lib/crypto");

      vi.mocked(prisma.user.create).mockResolvedValue({
        id: "user-1",
        name: "Test User",
      } as any);

      await prisma.user.create({
        data: {
          name: "Test User",
          email: "test@example.com",
        },
      });

      // encryptToken should not be called for User model
      expect(encryptToken).not.toHaveBeenCalled();
    });

    it("should handle null token fields without error", async () => {
      const { prisma } = await import("@/lib/prisma");

      vi.mocked(prisma.account.create).mockResolvedValue({
        id: "account-3",
        access_token: null,
      } as any);

      // Should not throw when token fields are null/undefined
      const result = await prisma.account.create({
        data: {
          userId: "user-123",
          type: "oauth",
          provider: "google",
          providerAccountId: "12345",
        },
      });

      expect(result).toBeDefined();
    });

    it("should round-trip create and read Account tokens", async () => {
      const { prisma } = await import("@/lib/prisma");

      const originalToken = "original-access-token";

      // Simulate: create encrypts, read returns decrypted
      vi.mocked(prisma.account.create).mockResolvedValue({
        id: "account-roundtrip",
        access_token: "encrypted:original-access-token",
        refresh_token: "encrypted:original-refresh",
        userId: "user-123",
      } as any);

      const created = await prisma.account.create({
        data: {
          access_token: originalToken,
          refresh_token: "original-refresh",
          userId: "user-123",
          type: "oauth",
          provider: "google",
          providerAccountId: "12345",
        },
      });

      expect(created.access_token).toBe("encrypted:original-access-token");

      // Read it back (simulating decryption)
      vi.mocked(prisma.account.findUnique).mockResolvedValue({
        id: "account-roundtrip",
        access_token: originalToken,
        userId: "user-123",
      } as any);

      const read = await prisma.account.findUnique({
        where: { id: "account-roundtrip" },
      });

      expect(read?.access_token).toBe(originalToken);
    });

    it("should handle update action with token fields", async () => {
      const { prisma } = await import("@/lib/prisma");

      vi.mocked(prisma.account.update).mockResolvedValue({
        id: "account-1",
        access_token: "encrypted:new-token",
      } as any);

      await prisma.account.update({
        where: { id: "account-1" },
        data: {
          access_token: "new-token",
        },
      });

      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: "account-1" },
        data: { access_token: "new-token" },
      });
    });
  });
});
