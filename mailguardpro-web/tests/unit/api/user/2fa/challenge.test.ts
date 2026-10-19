/**
 * Unit tests for POST /api/v1/user/2fa/challenge — completing the two-factor
 * challenge after sign-in, from the session cookie (no auth()).
 */

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    user: { update: vi.fn() },
  },
}));

vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: vi.fn() }));

vi.mock("@/lib/redis", () => ({ checkRateLimit: vi.fn() }));

vi.mock("@/lib/crypto", () => ({ decryptToken: vi.fn(() => "DECRYPTED-SECRET") }));

vi.mock("@/lib/request", () => ({ parseJsonBody: vi.fn() }));

vi.mock("@/lib/ssrf", () => ({ getClientIp: vi.fn(() => "8.8.8.8") }));

vi.mock("@/lib/totp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/totp")>();
  return { ...actual, verifyTotp: vi.fn() };
});

vi.mock("@/services/auditLogger", () => ({
  logAudit: vi.fn(),
  AuditAction: {
    USER_2FA_CHALLENGE_SUCCESS: "USER_2FA_CHALLENGE_SUCCESS",
    USER_2FA_CHALLENGE_FAILED: "USER_2FA_CHALLENGE_FAILED",
  },
  AuditResource: { USER: "User" },
}));

vi.mock("@/lib/logger", () => ({ loggerApi: { error: vi.fn() } }));

import { POST } from "@/app/api/v1/user/2fa/challenge/route";
import { decryptToken } from "@/lib/crypto";
import { validateCsrfOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/redis";
import { parseJsonBody } from "@/lib/request";
import { hashRecoveryCode, verifyTotp } from "@/lib/totp";
import { logAudit } from "@/services/auditLogger";

const okRate = { success: true, remaining: 9, resetAt: Date.now() + 300_000, limit: 10 };

function challengeRequest(withCookie = true): NextRequest {
  const headers: Record<string, string> = {
    origin: "http://localhost:3000",
    "content-type": "application/json",
  };
  if (withCookie) headers.cookie = "next-auth.session-token=tok-1";
  return new NextRequest("http://localhost:3000/api/v1/user/2fa/challenge", {
    method: "POST",
    headers,
    body: JSON.stringify({ code: "123456" }),
  });
}

/** A pending 2FA session row (not yet verified on this device). */
function pendingSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    sessionToken: "tok-1",
    userId: "user-1",
    expires: new Date(Date.now() + 86_400_000),
    twoFactorVerifiedAt: null,
    user: {
      id: "user-1",
      isActive: true,
      twoFactorEnabled: true,
      twoFactorSecret: "enc",
      twoFactorRecoveryCodes: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(validateCsrfOrigin).mockReturnValue({ valid: true });
  vi.mocked(checkRateLimit).mockResolvedValue(okRate);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/v1/user/2fa/challenge", () => {
  it("returns 403 when CSRF validation fails", async () => {
    vi.mocked(validateCsrfOrigin).mockReturnValue({ valid: false, error: "bad origin" });

    const response = await POST(challengeRequest());
    expect(response.status).toBe(403);
  });

  it("returns 401 when the session cookie is missing", async () => {
    const response = await POST(challengeRequest(false));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("No pending two-factor challenge");
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  it("returns 401 when the session row does not exist", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null);

    const response = await POST(challengeRequest());
    expect(response.status).toBe(401);
  });

  it("deletes expired session rows and returns 401", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(
      pendingSessionRow({ expires: new Date(Date.now() - 1000) }) as any,
    );
    vi.mocked(prisma.session.delete).mockResolvedValue({} as any);

    const response = await POST(challengeRequest());

    expect(response.status).toBe(401);
    expect(prisma.session.delete).toHaveBeenCalledWith({ where: { sessionToken: "tok-1" } });
  });

  it("returns 401 when the user is deactivated or 2FA is not fully set up", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(
      pendingSessionRow({
        user: {
          id: "user-1",
          isActive: false,
          twoFactorEnabled: true,
          twoFactorSecret: "enc",
          twoFactorRecoveryCodes: null,
        },
      }) as any,
    );

    const response = await POST(challengeRequest());
    expect(response.status).toBe(401);
  });

  it("returns 409 when the challenge was already completed on this device", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(
      pendingSessionRow({ twoFactorVerifiedAt: new Date() }) as any,
    );

    const response = await POST(challengeRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("already completed");
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(pendingSessionRow() as any);
    vi.mocked(checkRateLimit).mockResolvedValue({
      success: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
      limit: 10,
    });

    const response = await POST(challengeRequest());
    expect(response.status).toBe(429);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("returns 400 when no code is provided", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(pendingSessionRow() as any);
    vi.mocked(parseJsonBody).mockResolvedValue({ data: {} });

    const response = await POST(challengeRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Code is required");
  });

  it("returns 401 and audits the failure for an invalid code", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(pendingSessionRow() as any);
    vi.mocked(parseJsonBody).mockResolvedValue({ data: { code: "000000" } });
    vi.mocked(verifyTotp).mockReturnValue(false);

    const response = await POST(challengeRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Invalid code");
    expect(prisma.session.update).not.toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        action: "USER_2FA_CHALLENGE_FAILED",
        resource: "User",
      }),
    );
  });

  it("marks the device verified with a valid TOTP code and audits success", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(pendingSessionRow() as any);
    vi.mocked(parseJsonBody).mockResolvedValue({ data: { code: "123456" } });
    vi.mocked(verifyTotp).mockReturnValue(true);
    vi.mocked(prisma.session.update).mockResolvedValue({} as any);

    const response = await POST(challengeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(decryptToken).toHaveBeenCalledWith("enc");
    expect(verifyTotp).toHaveBeenCalledWith("DECRYPTED-SECRET", "123456");
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { sessionToken: "tok-1" },
      data: { twoFactorVerifiedAt: expect.any(Date) },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        action: "USER_2FA_CHALLENGE_SUCCESS",
        metadata: { method: "totp" },
      }),
    );
  });

  it("consumes a recovery code (one-time) and reports the remaining count", async () => {
    const usedCode = "AAAAA-AAAAA";
    const keptCode = "BBBBB-BBBBB";
    vi.mocked(prisma.session.findUnique).mockResolvedValue(
      pendingSessionRow({
        user: {
          id: "user-1",
          isActive: true,
          twoFactorEnabled: true,
          twoFactorSecret: "enc",
          twoFactorRecoveryCodes: JSON.stringify([
            hashRecoveryCode(usedCode),
            hashRecoveryCode(keptCode),
          ]),
        },
      }) as any,
    );
    // Case/separator-insensitive submission
    vi.mocked(parseJsonBody).mockResolvedValue({ data: { recoveryCode: "aaaaa aaaaa" } });
    vi.mocked(prisma.session.update).mockResolvedValue({} as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const response = await POST(challengeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(verifyTotp).not.toHaveBeenCalled();
    expect(prisma.session.update).toHaveBeenCalled();

    // Used code is consumed, the other one is kept
    const updateArgs = vi.mocked(prisma.user.update).mock.calls[0][0] as any;
    expect(JSON.parse(updateArgs.data.twoFactorRecoveryCodes)).toEqual([
      hashRecoveryCode(keptCode),
    ]);
    expect(body.data.recoveryCodesRemaining).toBe(1);

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "USER_2FA_CHALLENGE_SUCCESS",
        metadata: { method: "recovery_code" },
      }),
    );
  });

  it("returns 401 for an unknown recovery code", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(
      pendingSessionRow({
        user: {
          id: "user-1",
          isActive: true,
          twoFactorEnabled: true,
          twoFactorSecret: "enc",
          twoFactorRecoveryCodes: JSON.stringify([hashRecoveryCode("AAAAA-AAAAA")]),
        },
      }) as any,
    );
    vi.mocked(parseJsonBody).mockResolvedValue({ data: { recoveryCode: "ZZZZZ-ZZZZZ" } });

    const response = await POST(challengeRequest());
    expect(response.status).toBe(401);
    expect(prisma.session.update).not.toHaveBeenCalled();
  });

  it("returns 500 on unexpected errors", async () => {
    vi.mocked(prisma.session.findUnique).mockRejectedValue(new Error("db down"));

    const response = await POST(challengeRequest());
    expect(response.status).toBe(500);
  });
});
