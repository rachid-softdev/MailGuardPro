import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyCron = vi.hoisted(() => vi.fn());
const mockUserFindMany = vi.hoisted(() => vi.fn());
const mockAuditFindFirst = vi.hoisted(() => vi.fn());
const mockLogAudit = vi.hoisted(() => vi.fn());
const mockSendEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cronAuth", () => ({ verifyCronRequest: mockVerifyCron }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: mockUserFindMany },
    auditLog: { findFirst: mockAuditFindFirst },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
  loggerApi: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logError: vi.fn(),
}));
vi.mock("@/lib/resend", () => ({
  sendEmail: mockSendEmail,
  EMAIL_TEMPLATES: {
    lowCredits: vi.fn(() => ({ subject: "low credits", html: "<p>low</p>" })),
  },
}));
vi.mock("@/services/auditLogger", () => ({
  AuditAction: { CREDITS_LOW_WARNING: "CREDITS_LOW_WARNING" },
  AuditResource: { USER: "USER" },
  logAudit: mockLogAudit,
}));

import { GET } from "@/app/api/cron/check-credits/route";

function req() {
  return new NextRequest("http://localhost:3000/api/cron/check-credits");
}

// 900 <= 5000 * 0.2 → low; 1500 = 30% → not low
const STARTER_USER = {
  id: "u1",
  email: "sam@example.com",
  name: "Sam",
  credits: 900,
  plan: "STARTER",
};

describe("GET /api/cron/check-credits", () => {
  const prevKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyCron.mockResolvedValue({ authorized: true });
    mockUserFindMany.mockResolvedValue([]);
    mockAuditFindFirst.mockResolvedValue(null);
    mockLogAudit.mockResolvedValue(undefined);
    mockSendEmail.mockResolvedValue({ success: true });
    process.env.RESEND_API_KEY = "re_test_123";
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
  });

  it("should return the cronAuth response when unauthorized", async () => {
    mockVerifyCron.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await GET(req());

    expect(res.status).toBe(401);
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it("should query only paid, non-unlimited plans (excludes FREE and BUSINESS)", async () => {
    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.usersNotified).toBe(0);
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          plan: { notIn: ["FREE", "BUSINESS"] },
        }),
      }),
    );
  });

  it("should warn a low-credit user (audit + email)", async () => {
    mockUserFindMany.mockResolvedValue([STARTER_USER]);

    const res = await GET(req());
    const body = await res.json();

    expect(body.usersNotified).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "sam@example.com" }));
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        action: "CREDITS_LOW_WARNING",
        metadata: expect.objectContaining({
          creditsRemaining: 900,
          plan: "STARTER",
        }),
      }),
    );
  });

  it("should not warn above the 20% threshold", async () => {
    mockUserFindMany.mockResolvedValue([{ ...STARTER_USER, credits: 1500 }]);

    const res = await GET(req());
    const body = await res.json();

    expect(body.usersNotified).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("should skip users already warned within the 7-day cooldown", async () => {
    mockUserFindMany.mockResolvedValue([STARTER_USER]);
    mockAuditFindFirst.mockResolvedValueOnce({ id: "audit-1" });

    const res = await GET(req());
    const body = await res.json();

    expect(body.usersNotified).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLogAudit).not.toHaveBeenCalled();
    expect(mockAuditFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "u1",
          action: "CREDITS_LOW_WARNING",
        }),
      }),
    );
  });

  it("should audit without sending when RESEND_API_KEY is not set", async () => {
    delete process.env.RESEND_API_KEY;
    mockUserFindMany.mockResolvedValue([STARTER_USER]);

    const res = await GET(req());
    const body = await res.json();

    expect(body.usersNotified).toBe(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalled();
  });

  it("should return 500 when the DB query fails", async () => {
    mockUserFindMany.mockRejectedValue(new Error("db down"));

    const res = await GET(req());

    expect(res.status).toBe(500);
  });
});
