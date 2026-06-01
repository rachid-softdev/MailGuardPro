import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ──
const { mockAuth, mockPrisma, mockLoggerApi } = vi.hoisted(() => {
  const authMock = vi.fn();

  const prismaMock = {
    webhook: {
      findFirst: vi.fn(),
    },
    webhookDelivery: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  };

  const loggerMock = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };

  return {
    mockAuth: authMock,
    mockPrisma: prismaMock,
    mockLoggerApi: loggerMock,
  };
});

// ── Module mocks ──
vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
  handlers: { GET: vi.fn(), POST: vi.fn() },
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn() },
  loggerApi: mockLoggerApi,
  loggerWebhook: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  loggerWorker: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  loggerAuth: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// ── Utility to create mock NextRequest with URL ──
function createRequest(urlStr: string, method = "GET"): Request {
  return new Request(urlStr, { method });
}

import { GET } from "@/app/api/v1/webhooks/[id]/deliveries/route";

describe("GET /api/v1/webhooks/[id]/deliveries", () => {
  const WEBHOOK_ID = "wh-123";
  const USER_ID = "user-456";
  const BASE_URL = "https://mailguardpro.com";

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: authenticated
    mockAuth.mockResolvedValue({ user: { id: USER_ID } });

    // Default: webhook belongs to user
    mockPrisma.webhook.findFirst.mockResolvedValue({
      id: WEBHOOK_ID,
      userId: USER_ID,
      url: "https://example.com/webhook",
    });

    // Default: some deliveries
    mockPrisma.webhookDelivery.findMany.mockResolvedValue([
      {
        id: "del-1",
        webhookId: WEBHOOK_ID,
        event: "bulk_job_completed",
        status: "success",
        statusCode: 200,
        url: "https://example.com/webhook",
        createdAt: new Date("2026-06-01T12:00:00Z"),
      },
      {
        id: "del-2",
        webhookId: WEBHOOK_ID,
        event: "bulk_job_completed",
        status: "failed",
        statusCode: null,
        error: "Network error",
        url: "https://example.com/webhook",
        createdAt: new Date("2026-06-01T11:00:00Z"),
      },
    ]);

    mockPrisma.webhookDelivery.count.mockResolvedValue(2);
  });

  // ──────────────── Authentication ────────────────

  it("should return 401 when user is not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const req = createRequest(
      `${BASE_URL}/api/v1/webhooks/${WEBHOOK_ID}/deliveries?page=1&limit=20`,
    );
    const response = await GET(req, { params: Promise.resolve({ id: WEBHOOK_ID }) });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Authentication required");
  });

  it("should return 401 when session has no user id", async () => {
    mockAuth.mockResolvedValue({ user: { id: null } });

    const req = createRequest(`${BASE_URL}/api/v1/webhooks/${WEBHOOK_ID}/deliveries`);
    const response = await GET(req, { params: Promise.resolve({ id: WEBHOOK_ID }) });

    expect(response.status).toBe(401);
  });

  // ──────────────── Webhook ownership ────────────────

  it("should return 404 when webhook does not exist", async () => {
    mockPrisma.webhook.findFirst.mockResolvedValue(null);

    const req = createRequest(`${BASE_URL}/api/v1/webhooks/${WEBHOOK_ID}/deliveries`);
    const response = await GET(req, { params: Promise.resolve({ id: WEBHOOK_ID }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Webhook not found");
  });

  it("should verify webhook belongs to the authenticated user", async () => {
    const req = createRequest(`${BASE_URL}/api/v1/webhooks/${WEBHOOK_ID}/deliveries`);
    await GET(req, { params: Promise.resolve({ id: WEBHOOK_ID }) });

    expect(mockPrisma.webhook.findFirst).toHaveBeenCalledWith({
      where: { id: WEBHOOK_ID, userId: USER_ID },
    });
  });

  it("should return 404 when webhook belongs to another user", async () => {
    mockPrisma.webhook.findFirst.mockResolvedValue(null);

    const req = createRequest(`${BASE_URL}/api/v1/webhooks/${WEBHOOK_ID}/deliveries`);
    const response = await GET(req, { params: Promise.resolve({ id: WEBHOOK_ID }) });

    expect(response.status).toBe(404);
  });

  // ──────────────── Paginated listing ────────────────

  it("should return paginated deliveries on success", async () => {
    const req = createRequest(
      `${BASE_URL}/api/v1/webhooks/${WEBHOOK_ID}/deliveries?page=1&limit=20`,
    );
    const response = await GET(req, { params: Promise.resolve({ id: WEBHOOK_ID }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.pagination).toBeDefined();
  });

  it("should return correct pagination metadata", async () => {
    const req = createRequest(
      `${BASE_URL}/api/v1/webhooks/${WEBHOOK_ID}/deliveries?page=1&limit=20`,
    );
    const response = await GET(req, { params: Promise.resolve({ id: WEBHOOK_ID }) });
    const body = await response.json();

    expect(body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
    });
  });

  it("should use default pagination (page=1, limit=20) when not specified", async () => {
    const req = createRequest(`${BASE_URL}/api/v1/webhooks/${WEBHOOK_ID}/deliveries`);
    await GET(req, { params: Promise.resolve({ id: WEBHOOK_ID }) });

    expect(mockPrisma.webhookDelivery.findMany).toHaveBeenCalledWith({
      where: { webhookId: WEBHOOK_ID },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        event: true,
        status: true,
        statusCode: true,
        durationMs: true,
        error: true,
        createdAt: true,
      },
      skip: 0,
      take: 20,
    });
  });

  it("should respect custom page and limit parameters", async () => {
    const req = createRequest(
      `${BASE_URL}/api/v1/webhooks/${WEBHOOK_ID}/deliveries?page=3&limit=10`,
    );
    await GET(req, { params: Promise.resolve({ id: WEBHOOK_ID }) });

    expect(mockPrisma.webhookDelivery.findMany).toHaveBeenCalledWith({
      where: { webhookId: WEBHOOK_ID },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        event: true,
        status: true,
        statusCode: true,
        durationMs: true,
        error: true,
        createdAt: true,
      },
      skip: 20, // (3-1) * 10 = 20
      take: 10,
    });
  });

  it("should compute total pages correctly", async () => {
    mockPrisma.webhookDelivery.count.mockResolvedValue(25);
    mockPrisma.webhookDelivery.findMany.mockResolvedValue(
      Array(10)
        .fill(null)
        .map((_, i) => ({
          id: `del-${i}`,
          webhookId: WEBHOOK_ID,
          event: "test",
          status: "success",
          url: "https://example.com",
          createdAt: new Date(),
        })),
    );

    const req = createRequest(
      `${BASE_URL}/api/v1/webhooks/${WEBHOOK_ID}/deliveries?page=1&limit=10`,
    );
    const response = await GET(req, { params: Promise.resolve({ id: WEBHOOK_ID }) });
    const body = await response.json();

    expect(body.pagination.totalPages).toBe(3); // ceil(25/10) = 3
    expect(body.pagination.total).toBe(25);
  });

  it("should handle empty deliveries", async () => {
    mockPrisma.webhookDelivery.findMany.mockResolvedValue([]);
    mockPrisma.webhookDelivery.count.mockResolvedValue(0);

    const req = createRequest(`${BASE_URL}/api/v1/webhooks/${WEBHOOK_ID}/deliveries`);
    const response = await GET(req, { params: Promise.resolve({ id: WEBHOOK_ID }) });
    const body = await response.json();

    expect(body.data).toHaveLength(0);
    expect(body.pagination.total).toBe(0);
    expect(body.pagination.totalPages).toBe(0);
  });

  // ──────────────── Ordering ────────────────

  it("should order deliveries by createdAt descending", async () => {
    const req = createRequest(`${BASE_URL}/api/v1/webhooks/${WEBHOOK_ID}/deliveries`);
    await GET(req, { params: Promise.resolve({ id: WEBHOOK_ID }) });

    expect(mockPrisma.webhookDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  // ──────────────── Error handling ────────────────

  it("should return 500 when database query fails", async () => {
    mockPrisma.webhook.findFirst.mockRejectedValue(new Error("DB connection lost"));

    const req = createRequest(`${BASE_URL}/api/v1/webhooks/${WEBHOOK_ID}/deliveries`);
    const response = await GET(req, { params: Promise.resolve({ id: WEBHOOK_ID }) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Internal server error");
  });

  it("should log error on database failure", async () => {
    mockPrisma.webhook.findFirst.mockRejectedValue(new Error("DB error"));

    const req = createRequest(`${BASE_URL}/api/v1/webhooks/${WEBHOOK_ID}/deliveries`);
    await GET(req, { params: Promise.resolve({ id: WEBHOOK_ID }) });

    expect(mockLoggerApi.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Webhook deliveries list error",
    );
  });

  // ──────────────── Edge cases ────────────────

  it("should handle invalid page number (parseInt returns NaN, serialized as null in JSON)", async () => {
    const req = createRequest(`${BASE_URL}/api/v1/webhooks/${WEBHOOK_ID}/deliveries?page=invalid`);
    const response = await GET(req, { params: Promise.resolve({ id: WEBHOOK_ID }) });
    const body = await response.json();

    // parseInt('invalid') returns NaN, which becomes null in JSON
    // The code does not coerce NaN to a default value
    expect(body.pagination.page).toBeNull();
  });

  it("should handle invalid limit (parseInt returns NaN, serialized as null in JSON)", async () => {
    const req = createRequest(`${BASE_URL}/api/v1/webhooks/${WEBHOOK_ID}/deliveries?limit=invalid`);
    const response = await GET(req, { params: Promise.resolve({ id: WEBHOOK_ID }) });
    const body = await response.json();

    expect(body.pagination.limit).toBeNull();
  });

  it("should clamp negative page numbers to 1", async () => {
    const req = createRequest(`${BASE_URL}/api/v1/webhooks/${WEBHOOK_ID}/deliveries?page=-5`);
    const response = await GET(req, { params: Promise.resolve({ id: WEBHOOK_ID }) });
    const body = await response.json();

    // Page is clamped to Math.max(1, -5) = 1
    expect(body.pagination.page).toBe(1);
  });

  it("should include deliveries data in response (with date serialization)", async () => {
    const now = new Date("2026-06-01T12:00:00Z");
    const deliveries = [
      {
        id: "del-1",
        webhookId: WEBHOOK_ID,
        event: "test",
        status: "success",
        url: "https://example.com",
        createdAt: now,
      },
    ];
    mockPrisma.webhookDelivery.findMany.mockResolvedValue(deliveries);

    const req = createRequest(`${BASE_URL}/api/v1/webhooks/${WEBHOOK_ID}/deliveries`);
    const response = await GET(req, { params: Promise.resolve({ id: WEBHOOK_ID }) });
    const body = await response.json();

    // JSON serializes Date to ISO string, so compare individual fields
    expect(body.data[0].id).toBe("del-1");
    expect(body.data[0].event).toBe("test");
    expect(body.data[0].status).toBe("success");
    expect(body.data[0].createdAt).toBe(now.toISOString());
  });
});
