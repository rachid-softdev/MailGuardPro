import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ──────────────────────────────────
const { mockRedis, mockPrisma, mockLogger } = vi.hoisted(() => {
  const mockRedisInstance = {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue("OK"),
  };

  const mockPrismaClient = {
    idempotencyKey: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
  };

  const mockLoggerInstance = {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => mockLoggerInstance),
  };

  return {
    mockRedis: mockRedisInstance,
    mockPrisma: mockPrismaClient,
    mockLogger: mockLoggerInstance,
  };
});

// ── Module mocks ───────────────────────────────────
vi.mock("@/lib/redis", () => ({
  redis: mockRedis,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/logger", () => ({
  logger: mockLogger,
}));

// ── Subject under test ─────────────────────────────
import { getIdempotencyResult, setIdempotencyResult } from "@/lib/idempotency";

describe("idempotency", () => {
  const TEST_KEY = "test-idem-key";
  const TEST_RESPONSE = { data: "success" };
  const TEST_STATUS = 200;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Set a fixed "now"
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ────────────────────────────────────────────────
  // getIdempotencyResult
  // ────────────────────────────────────────────────

  describe("getIdempotencyResult", () => {
    // ── Redis hit ──
    it("should return cached response from Redis (Layer 1 hit)", async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ response: TEST_RESPONSE, statusCode: TEST_STATUS }),
      );

      const result = await getIdempotencyResult(TEST_KEY);

      expect(result).toEqual({ response: TEST_RESPONSE, statusCode: TEST_STATUS });
      expect(mockRedis.get).toHaveBeenCalledWith(`idempotency:${TEST_KEY}`);
      // Should NOT query DB
      expect(mockPrisma.idempotencyKey.findUnique).not.toHaveBeenCalled();
    });

    it("should parse Redis JSON response correctly", async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ response: { items: [1, 2, 3] }, statusCode: 201 }),
      );

      const result = await getIdempotencyResult(TEST_KEY);

      expect(result).toEqual({ response: { items: [1, 2, 3] }, statusCode: 201 });
    });

    // ── Redis miss, DB hit (not expired) ──
    it("should return DB record when Redis miss and record not expired (Layer 2 hit)", async () => {
      mockRedis.get.mockResolvedValue(null);

      const futureDate = new Date(Date.now() + 3600000); // 1 hour from now
      mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
        key: TEST_KEY,
        response: TEST_RESPONSE,
        statusCode: TEST_STATUS,
        expiresAt: futureDate,
      });

      const result = await getIdempotencyResult(TEST_KEY);

      expect(result).toEqual({ response: TEST_RESPONSE, statusCode: TEST_STATUS });
      expect(mockPrisma.idempotencyKey.findUnique).toHaveBeenCalledWith({
        where: { key: TEST_KEY },
      });
    });

    it("should populate Redis cache from DB record (Layer 2 → Layer 1 cache)", async () => {
      mockRedis.get.mockResolvedValue(null);

      const futureDate = new Date(Date.now() + 3600000);
      mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
        key: TEST_KEY,
        response: TEST_RESPONSE,
        statusCode: TEST_STATUS,
        expiresAt: futureDate,
      });

      await getIdempotencyResult(TEST_KEY);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `idempotency:${TEST_KEY}`,
        86400, // 24h TTL
        JSON.stringify({ response: TEST_RESPONSE, statusCode: TEST_STATUS }),
      );
    });

    // ── Redis miss, DB hit (expired) ──
    it("should delete expired DB record and return null", async () => {
      mockRedis.get.mockResolvedValue(null);

      const expiredDate = new Date(Date.now() - 3600000); // 1 hour ago
      mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
        key: TEST_KEY,
        response: TEST_RESPONSE,
        statusCode: TEST_STATUS,
        expiresAt: expiredDate,
      });

      const result = await getIdempotencyResult(TEST_KEY);

      expect(result).toBeNull();
      expect(mockPrisma.idempotencyKey.delete).toHaveBeenCalledWith({
        where: { key: TEST_KEY },
      });
    });

    it("should not throw if deleting expired record fails", async () => {
      mockRedis.get.mockResolvedValue(null);

      const expiredDate = new Date(Date.now() - 3600000);
      mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
        key: TEST_KEY,
        response: TEST_RESPONSE,
        statusCode: TEST_STATUS,
        expiresAt: expiredDate,
      });
      mockPrisma.idempotencyKey.delete.mockRejectedValue(new Error("Delete failed"));

      // Should not throw
      const result = await getIdempotencyResult(TEST_KEY);

      expect(result).toBeNull();
    });

    // ── Complete miss ──
    it("should return null when both Redis and DB have no record", async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.idempotencyKey.findUnique.mockResolvedValue(null);

      const result = await getIdempotencyResult(TEST_KEY);

      expect(result).toBeNull();
    });

    // ── Redis error, DB fallback ──
    it("should fall back to DB when Redis throws an error", async () => {
      mockRedis.get.mockRejectedValue(new Error("Redis connection lost"));

      const futureDate = new Date(Date.now() + 3600000);
      mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
        key: TEST_KEY,
        response: TEST_RESPONSE,
        statusCode: TEST_STATUS,
        expiresAt: futureDate,
      });

      const result = await getIdempotencyResult(TEST_KEY);

      expect(result).toEqual({ response: TEST_RESPONSE, statusCode: TEST_STATUS });
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("should return null when both Redis and DB fail", async () => {
      mockRedis.get.mockRejectedValue(new Error("Redis down"));
      mockPrisma.idempotencyKey.findUnique.mockRejectedValue(new Error("DB down"));

      const result = await getIdempotencyResult(TEST_KEY);

      expect(result).toBeNull();
      // Should log warnings for both failures
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
    });

    it("should handle JSON parse errors gracefully in Redis path", async () => {
      mockRedis.get.mockResolvedValue("invalid-json");

      const futureDate = new Date(Date.now() + 3600000);
      mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
        key: TEST_KEY,
        response: TEST_RESPONSE,
        statusCode: TEST_STATUS,
        expiresAt: futureDate,
      });

      const result = await getIdempotencyResult(TEST_KEY);

      // Falls through to DB despite JSON parse error
      expect(result).toEqual({ response: TEST_RESPONSE, statusCode: TEST_STATUS });
    });
  });

  // ────────────────────────────────────────────────
  // setIdempotencyResult
  // ────────────────────────────────────────────────

  describe("setIdempotencyResult", () => {
    it("should upsert the result in the database", async () => {
      mockPrisma.idempotencyKey.upsert.mockResolvedValue({});

      await setIdempotencyResult(TEST_KEY, TEST_RESPONSE, TEST_STATUS);

      expect(mockPrisma.idempotencyKey.upsert).toHaveBeenCalledWith({
        where: { key: TEST_KEY },
        update: {
          response: TEST_RESPONSE,
          statusCode: TEST_STATUS,
          expiresAt: expect.any(Date),
        },
        create: {
          key: TEST_KEY,
          response: TEST_RESPONSE,
          statusCode: TEST_STATUS,
          expiresAt: expect.any(Date),
        },
      });
    });

    it("should set the result in Redis with 24h TTL", async () => {
      mockPrisma.idempotencyKey.upsert.mockResolvedValue({});

      await setIdempotencyResult(TEST_KEY, TEST_RESPONSE, TEST_STATUS);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `idempotency:${TEST_KEY}`,
        86400,
        JSON.stringify({ response: TEST_RESPONSE, statusCode: TEST_STATUS }),
      );
    });

    it("should still set Redis cache even if DB upsert fails", async () => {
      mockPrisma.idempotencyKey.upsert.mockRejectedValue(new Error("DB upsert failed"));

      await setIdempotencyResult(TEST_KEY, TEST_RESPONSE, TEST_STATUS);

      // Should have logged the error
      expect(mockLogger.warn).toHaveBeenCalled();
      // Redis should still be called
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it("should not throw when Redis setex fails after DB upsert", async () => {
      mockPrisma.idempotencyKey.upsert.mockResolvedValue({});
      mockRedis.setex.mockRejectedValue(new Error("Redis setex failed"));

      // Should not throw
      await expect(
        setIdempotencyResult(TEST_KEY, TEST_RESPONSE, TEST_STATUS),
      ).resolves.toBeUndefined();
    });

    it("should create an expiresAt value 24h in the future", async () => {
      mockPrisma.idempotencyKey.upsert.mockResolvedValue({});

      await setIdempotencyResult(TEST_KEY, TEST_RESPONSE, TEST_STATUS);

      const upsertCall = mockPrisma.idempotencyKey.upsert.mock.calls[0][0];
      const expiresAt = upsertCall.create.expiresAt;
      const expectedTime = Date.now() + 24 * 60 * 60 * 1000;

      expect(expiresAt.getTime()).toBe(expectedTime);
    });
  });

  // ────────────────────────────────────────────────
  // Key format verification
  // ────────────────────────────────────────────────

  it("should prefix Redis keys with 'idempotency:' namespace", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.idempotencyKey.findUnique.mockResolvedValue(null);

    await getIdempotencyResult("my-custom-key");

    expect(mockRedis.get).toHaveBeenCalledWith("idempotency:my-custom-key");
  });
});
