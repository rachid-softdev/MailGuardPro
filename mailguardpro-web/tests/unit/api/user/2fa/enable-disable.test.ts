/**
 * Unit tests for:
 *   POST /api/v1/user/2fa/enable   — confirm enrollment (TOTP code → enable)
 *   POST /api/v1/user/2fa/disable  — turn 2FA off (TOTP or recovery code)
 */

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    session: { updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: vi.fn() }));

vi.mock("@/lib/redis", () => ({ checkRateLimit: vi.fn() }));

vi.mock("@/lib/crypto", () => ({ decryptToken: vi.fn(() => "DECRYPTED-SECRET") }));

vi.mock("@/lib/request", () => ({ parseJsonBody: vi.fn() }));

vi.mock("@/lib/totp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/totp")>();
  return { ...actual, verifyTotp: vi.fn() };
});

vi.mock("@/services/auditLogger", () => ({
  logAudit: vi.fn(),
  AuditAction: {
    USER_2FA_ENABLED: "USER_2FA_ENABLED",
    USER_2FA_DISABLED: "USER_2FA_DISABLED",
  },
  AuditResource: { USER: "User" },
}));

vi.mock("@/lib/logger", () => ({ loggerApi: { error: vi.fn() } }));

import { POST as DISABLE_POST } from "@/app/api/v1/user/2fa/disable/route";
import { POST as ENABLE_POST } from "@/app/api/v1/user/2fa/enable/route";
import { auth } from "@/lib/auth";
import { decryptToken } from "@/lib/crypto";
import { validateCsrfOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/redis";
import { parseJsonBody } from "@/lib/request";
import { hashRecoveryCode, verifyTotp } from "@/lib/totp";
import { logAudit } from "@/services/auditLogger";

const mockSession = { user: { id: "user-1", email: "user@example.com", plan: "FREE" } };

const okRate = { success: true, remaining: 9, resetAt: Date.now() + 300_000, limit: 10 };

function postRequest(path: string, withCookie = true): NextRequest {
  const headers: Record<string, string> = {
    origin: "http://localhost:3000",
    "content-type": "application/json",
  };
  if (withCookie) headers.cookie = "next-auth.session-token=tok-1";
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ code: "123456" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(validateCsrfOrigin).mockReturnValue({ valid: true });
  vi.mocked(checkRateLimit).mockResolvedValue(okRate);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/v1/user/2fa/enable", () => {
  it("returns 403 when CSRF validation fails", async () => {
    vi.mocked(validateCsrfOrigin).mockReturnValue({ valid: false, error: "bad origin" });

    const response = await ENABLE_POST(postRequest("/api/v1/user/2fa/enable"));
    expect(response.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const response = await ENABLE_POST(postRequest("/api/v1/user/2fa/enable"));
    expect(response.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(checkRateLimit).mockResolvedValue({
      success: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
      limit: 10,
    });

    const response = await ENABLE_POST(postRequest("/api/v1/user/2fa/enable"));
    expect(response.status).toBe(429);
  });

  it("returns 400 when the code is missing", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(parseJsonBody).mockResolvedValue({ data: {} });

    const response = await ENABLE_POST(postRequest("/api/v1/user/2fa/enable"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Code is required");
  });

  it("returns 400 when setup was not started", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(parseJsonBody).mockResolvedValue({ data: { code: "123456" } });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      twoFactorEnabled: false,
      twoFactorSecret: null,
    } as any);

    const response = await ENABLE_POST(postRequest("/api/v1/user/2fa/enable"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("setup first");
  });

  it("returns 400 for an invalid code", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(parseJsonBody).mockResolvedValue({ data: { code: "000000" } });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      twoFactorEnabled: false,
      twoFactorSecret: "enc",
    } as any);
    vi.mocked(verifyTotp).mockReturnValue(false);

    const response = await ENABLE_POST(postRequest("/api/v1/user/2fa/enable"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid code");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("enables 2FA, stores hashed recovery codes, and keeps the current device verified", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(parseJsonBody).mockResolvedValue({ data: { code: "123456" } });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      twoFactorEnabled: false,
      twoFactorSecret: "enc",
    } as any);
    vi.mocked(verifyTotp).mockReturnValue(true);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);
    vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 1 } as any);

    const response = await ENABLE_POST(postRequest("/api/v1/user/2fa/enable"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.recoveryCodes).toHaveLength(10);

    // Verification ran against the decrypted secret
    expect(decryptToken).toHaveBeenCalledWith("enc");
    expect(verifyTotp).toHaveBeenCalledWith("DECRYPTED-SECRET", "123456");

    // Stored recovery codes are hashes, never plaintext
    const updateArgs = vi.mocked(prisma.user.update).mock.calls[0][0] as any;
    expect(updateArgs.data.twoFactorEnabled).toBe(true);
    const stored = JSON.parse(updateArgs.data.twoFactorRecoveryCodes);
    expect(stored).toHaveLength(10);
    for (const code of body.data.recoveryCodes) {
      expect(stored).toContain(hashRecoveryCode(code));
    }

    // Other devices must solve the challenge for the new secret
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", sessionToken: { not: "tok-1" } },
      data: { twoFactorVerifiedAt: null },
    });
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", sessionToken: "tok-1" },
      data: { twoFactorVerifiedAt: expect.any(Date) },
    });

    expect(logAudit).toHaveBeenCalledWith({
      userId: "user-1",
      action: "USER_2FA_ENABLED",
      resource: "User",
    });
  });

  it("skips session updates when the session cookie is missing", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(parseJsonBody).mockResolvedValue({ data: { code: "123456" } });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      twoFactorEnabled: false,
      twoFactorSecret: "enc",
    } as any);
    vi.mocked(verifyTotp).mockReturnValue(true);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const response = await ENABLE_POST(postRequest("/api/v1/user/2fa/enable", false));

    expect(response.status).toBe(200);
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/user/2fa/disable", () => {
  it("returns 403 when CSRF validation fails", async () => {
    vi.mocked(validateCsrfOrigin).mockReturnValue({ valid: false, error: "bad origin" });

    const response = await DISABLE_POST(postRequest("/api/v1/user/2fa/disable"));
    expect(response.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const response = await DISABLE_POST(postRequest("/api/v1/user/2fa/disable"));
    expect(response.status).toBe(401);
  });

  it("returns 400 when neither code nor recovery code is provided", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(parseJsonBody).mockResolvedValue({ data: {} });

    const response = await DISABLE_POST(postRequest("/api/v1/user/2fa/disable"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Code is required");
  });

  it("returns 400 when 2FA is not enabled", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(parseJsonBody).mockResolvedValue({ data: { code: "123456" } });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorRecoveryCodes: null,
    } as any);

    const response = await DISABLE_POST(postRequest("/api/v1/user/2fa/disable"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("not enabled");
  });

  it("returns 400 for an invalid TOTP code", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(parseJsonBody).mockResolvedValue({ data: { code: "000000" } });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      twoFactorEnabled: true,
      twoFactorSecret: "enc",
      twoFactorRecoveryCodes: null,
    } as any);
    vi.mocked(verifyTotp).mockReturnValue(false);

    const response = await DISABLE_POST(postRequest("/api/v1/user/2fa/disable"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid code");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("disables 2FA with a valid TOTP code and clears the secret", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(parseJsonBody).mockResolvedValue({ data: { code: "123456" } });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      twoFactorEnabled: true,
      twoFactorSecret: "enc",
      twoFactorRecoveryCodes: '["hash-1"]',
    } as any);
    vi.mocked(verifyTotp).mockReturnValue(true);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const response = await DISABLE_POST(postRequest("/api/v1/user/2fa/disable"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorRecoveryCodes: null,
      },
    });
    expect(logAudit).toHaveBeenCalledWith({
      userId: "user-1",
      action: "USER_2FA_DISABLED",
      resource: "User",
    });
  });

  it("disables 2FA with a valid recovery code (no TOTP check)", async () => {
    const realCode = "ABCDE-FGHJK";
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(parseJsonBody).mockResolvedValue({ data: { recoveryCode: "abcde fghjk" } });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      twoFactorEnabled: true,
      twoFactorSecret: "enc",
      twoFactorRecoveryCodes: JSON.stringify([hashRecoveryCode(realCode)]),
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const response = await DISABLE_POST(postRequest("/api/v1/user/2fa/disable"));

    expect(response.status).toBe(200);
    expect(verifyTotp).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it("returns 500 on unexpected errors", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(parseJsonBody).mockResolvedValue({ data: { code: "123456" } });
    vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error("db down"));

    const response = await DISABLE_POST(postRequest("/api/v1/user/2fa/disable"));
    expect(response.status).toBe(500);
  });
});
