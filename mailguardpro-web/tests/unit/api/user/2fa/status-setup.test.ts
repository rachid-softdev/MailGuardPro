/**
 * Unit tests for:
 *   GET  /api/v1/user/2fa        — two-factor status
 *   POST /api/v1/user/2fa/setup  — enrollment start (secret generation)
 */

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: vi.fn() }));

vi.mock("@/lib/redis", () => ({ checkRateLimit: vi.fn() }));

vi.mock("@/lib/crypto", () => ({ encryptToken: vi.fn(() => "enc-secret") }));

vi.mock("@/lib/logger", () => ({ loggerApi: { error: vi.fn() } }));

import { GET } from "@/app/api/v1/user/2fa/route";
import { POST as SETUP_POST } from "@/app/api/v1/user/2fa/setup/route";
import { auth } from "@/lib/auth";
import { encryptToken } from "@/lib/crypto";
import { validateCsrfOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/redis";

const mockSession = { user: { id: "user-1", email: "user@example.com", plan: "FREE" } };

const okRate = { success: true, remaining: 9, resetAt: Date.now() + 300_000, limit: 10 };

function statusRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/v1/user/2fa", { method: "GET" });
}

function setupRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/v1/user/2fa/setup", {
    method: "POST",
    headers: { origin: "http://localhost:3000" },
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

describe("GET /api/v1/user/2fa", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const response = await GET(statusRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("returns 401 when the user row is missing", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const response = await GET(statusRequest());
    expect(response.status).toBe(401);
  });

  it("returns disabled status with 0 remaining codes", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      twoFactorEnabled: false,
      twoFactorRecoveryCodes: '["hash-1","hash-2"]',
    } as any);

    const response = await GET(statusRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ enabled: false, recoveryCodesRemaining: 0 });
  });

  it("returns enabled status and the remaining recovery code count", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      twoFactorEnabled: true,
      twoFactorRecoveryCodes: '["hash-1","hash-2","hash-3"]',
    } as any);

    const response = await GET(statusRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ enabled: true, recoveryCodesRemaining: 3 });
  });

  it("tolerates corrupt stored recovery codes", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      twoFactorEnabled: true,
      twoFactorRecoveryCodes: "not-json",
    } as any);

    const response = await GET(statusRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.recoveryCodesRemaining).toBe(0);
  });

  it("returns 500 on unexpected errors", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error("db down"));

    const response = await GET(statusRequest());
    expect(response.status).toBe(500);
  });
});

describe("POST /api/v1/user/2fa/setup", () => {
  it("returns 403 when CSRF validation fails", async () => {
    vi.mocked(validateCsrfOrigin).mockReturnValue({ valid: false, error: "bad origin" });

    const response = await SETUP_POST(setupRequest());
    expect(response.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const response = await SETUP_POST(setupRequest());
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

    const response = await SETUP_POST(setupRequest());
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.retryAfter).toBeGreaterThan(Date.now());
  });

  it("returns 401 when the user row is missing", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const response = await SETUP_POST(setupRequest());
    expect(response.status).toBe(401);
  });

  it("returns 400 when 2FA is already enabled", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      email: "user@example.com",
      twoFactorEnabled: true,
    } as any);

    const response = await SETUP_POST(setupRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("already enabled");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("stores the encrypted secret and returns the secret + otpauth URI", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      email: "user@example.com",
      twoFactorEnabled: false,
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const response = await SETUP_POST(setupRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(body.data.otpauthUri.startsWith("otpauth://totp/")).toBe(true);
    expect(body.data.otpauthUri).toContain(`secret=${body.data.secret}`);

    // Only the ciphertext is persisted
    expect(encryptToken).toHaveBeenCalledWith(body.data.secret);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { twoFactorSecret: "enc-secret" },
    });
  });

  it("returns 500 on unexpected errors", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error("db down"));

    const response = await SETUP_POST(setupRequest());
    expect(response.status).toBe(500);
  });
});
