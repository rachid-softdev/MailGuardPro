import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashEmail } from "@/lib/emailHash";

const {
  mockAuth,
  mockCsrf,
  mockValidationFindMany,
  mockValidationDeleteMany,
  mockGetBulkJobEmailMaps,
  mockRateLimit,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCsrf: vi.fn(),
  mockValidationFindMany: vi.fn(),
  mockValidationDeleteMany: vi.fn(),
  mockGetBulkJobEmailMaps: vi.fn(),
  mockRateLimit: vi.fn(),
  mockAuditCreate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: mockCsrf }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    validation: {
      findMany: mockValidationFindMany,
      deleteMany: mockValidationDeleteMany,
    },
    auditLog: { create: mockAuditCreate },
  },
}));
vi.mock("@/services/emailResolver", () => ({
  getBulkJobEmailMaps: mockGetBulkJobEmailMaps,
}));
vi.mock("@/lib/rateLimits", () => ({
  checkRateLimitByPlan: mockRateLimit,
}));

import { POST as batchDelete } from "@/app/api/v1/validations/batch-delete/route";
import { POST as batchExport } from "@/app/api/v1/validations/export/route";

const DELETE_URL = "http://localhost:3000/api/v1/validations/batch-delete";
const EXPORT_URL = "http://localhost:3000/api/v1/validations/export";

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { origin: "http://localhost:3000", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const createdAt = new Date("2026-10-01T12:00:00.000Z");

const rows = [
  {
    id: "v1",
    email: "a***@example.com",
    emailHash: hashEmail("alice@example.com"),
    bulkJobId: "job-1",
    score: 95,
    status: "valid",
    createdAt,
    checksJson: { format: { passed: true }, smtp: { passed: true } },
    processingTimeMs: 120,
  },
  {
    id: "v2",
    email: "b***@example.com",
    emailHash: hashEmail("bob@example.com"),
    bulkJobId: null,
    score: 40,
    status: "invalid",
    createdAt,
    checksJson: { format: { passed: false } },
    processingTimeMs: 80,
  },
];

describe("POST /api/v1/validations/batch-delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockCsrf.mockReturnValue({ valid: true });
    mockRateLimit.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      resetAt: Date.now() + 3_600_000,
    });
    mockValidationDeleteMany.mockResolvedValue({ count: 2 });
    mockAuditCreate.mockResolvedValue({});
  });

  it("returns 401 without a session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await batchDelete(jsonRequest(DELETE_URL, { ids: ["v1"] }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when CSRF validation fails", async () => {
    mockCsrf.mockReturnValue({ valid: false, error: "Missing Origin" });
    const res = await batchDelete(jsonRequest(DELETE_URL, { ids: ["v1"] }));
    expect(res.status).toBe(403);
  });

  it("rejects an empty selection", async () => {
    const res = await batchDelete(jsonRequest(DELETE_URL, { ids: [] }));
    expect(res.status).toBe(400);
  });

  it("deletes only rows owned by the session user", async () => {
    const res = await batchDelete(jsonRequest(DELETE_URL, { ids: ["v1", "v2"] }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { deleted: 2 },
    });
    expect(mockValidationDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", id: { in: ["v1", "v2"] } },
    });
    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        action: "VALIDATION_DELETED",
        resource: "Validation",
        metadata: { requested: 2, deleted: 2 },
      }),
    });
  });

  it("returns 429 when the delete rate limit is exceeded", async () => {
    mockRateLimit.mockResolvedValue({
      success: false,
      limit: 5,
      remaining: 0,
      resetAt: Date.now() + 3_600_000,
    });

    const res = await batchDelete(jsonRequest(DELETE_URL, { ids: ["v1"] }));

    expect(res.status).toBe(429);
    expect(mockValidationDeleteMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/validations/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockCsrf.mockReturnValue({ valid: true });
    mockRateLimit.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      resetAt: Date.now() + 3_600_000,
    });
    mockValidationFindMany.mockResolvedValue(rows);
    mockGetBulkJobEmailMaps.mockResolvedValue(
      new Map([["job-1", new Map([[hashEmail("alice@example.com"), "alice@example.com"]])]]),
    );
  });

  it("returns 401 without a session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await batchExport(jsonRequest(EXPORT_URL, { ids: ["v1"] }));
    expect(res.status).toBe(401);
  });

  it("rejects an empty selection", async () => {
    const res = await batchExport(jsonRequest(EXPORT_URL, { ids: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when none of the selected rows exist", async () => {
    mockValidationFindMany.mockResolvedValue([]);
    const res = await batchExport(jsonRequest(EXPORT_URL, { ids: ["missing"] }));
    expect(res.status).toBe(404);
  });

  it("scopes the selection to the session user", async () => {
    await batchExport(jsonRequest(EXPORT_URL, { ids: ["v1", "v2"] }));

    expect(mockValidationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", id: { in: ["v1", "v2"] } },
      }),
    );
  });

  it("exports bulk rows with original addresses and keeps single rows masked", async () => {
    const res = await batchExport(jsonRequest(EXPORT_URL, { ids: ["v1", "v2"] }));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("mailguard-history-");

    const csv = await res.text();
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("email,score,status");
    expect(csv).toContain("alice@example.com,95,valid");
    expect(csv).toContain("b***@example.com,40,invalid");
    expect(mockGetBulkJobEmailMaps).toHaveBeenCalledWith(["job-1"], "user-1");
  });
});
