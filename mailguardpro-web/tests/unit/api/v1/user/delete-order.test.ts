/**
 * Unit tests for app/api/v1/user/route.ts — DELETE /api/v1/user
 *
 * Tests the schedule-based account deletion with undo support.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Prisma mock — must include deletionSchedule used by current source
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deletionSchedule: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

// Auth mock — return a valid session
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: "user-123", email: "test@example.com" },
  }),
}));

// CSRF mock — always pass
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: vi.fn().mockReturnValue({ valid: true }),
}));

// Logger mock
vi.mock("@/lib/logger", () => ({
  loggerApi: { error: vi.fn() },
}));

import { NextRequest } from "next/server";
import { DELETE } from "@/app/api/v1/user/route";
import { prisma } from "@/lib/prisma";

function createRequest(): NextRequest {
  return new NextRequest("https://mailguard.pro/api/v1/user", {
    method: "DELETE",
    headers: { origin: "https://mailguard.pro", "x-forwarded-for": "8.8.8.8" },
  });
}

describe("DELETE /api/v1/user", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should schedule account deletion when no existing schedule", async () => {
    vi.mocked(prisma.deletionSchedule.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.deletionSchedule.create).mockResolvedValue({
      id: "schedule-1",
      userId: "user-123",
      expiresAt: new Date(Date.now() + 5000),
    } as any);

    const response = await DELETE(createRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.undoable).toBe(true);
    expect(body.message).toContain("Account deletion scheduled");
    expect(prisma.deletionSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-123",
        }),
      }),
    );
  });

  it("should return 409 when deletion already scheduled", async () => {
    vi.mocked(prisma.deletionSchedule.findUnique).mockResolvedValue({
      id: "existing-schedule",
      userId: "user-123",
      expiresAt: new Date(Date.now() + 5000),
    } as any);

    const response = await DELETE(createRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error).toContain("already scheduled");
    expect(prisma.deletionSchedule.create).not.toHaveBeenCalled();
  });

  it("should return 401 when not authenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as any);

    const response = await DELETE(createRequest());
    expect(response.status).toBe(401);
  });

  it("should return 403 when CSRF validation fails", async () => {
    const { validateCsrfOrigin } = await import("@/lib/csrf");
    vi.mocked(validateCsrfOrigin).mockReturnValueOnce({
      valid: false,
      error: "Origin not allowed",
    });

    const response = await DELETE(createRequest());
    expect(response.status).toBe(403);
  });

  it("should return 500 when prisma.create fails", async () => {
    vi.mocked(prisma.deletionSchedule.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.deletionSchedule.create).mockRejectedValue(new Error("DB error"));

    const response = await DELETE(createRequest());
    expect(response.status).toBe(500);
  });

  it("should return 500 when prisma.findUnique fails", async () => {
    vi.mocked(prisma.deletionSchedule.findUnique).mockRejectedValue(new Error("DB error"));

    const response = await DELETE(createRequest());
    expect(response.status).toBe(500);
  });
});
