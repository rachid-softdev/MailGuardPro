import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth, mockPrisma, mockLoggerApi } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockPrisma: { session: { findMany: vi.fn() } },
  mockLoggerApi: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn() },
  loggerApi: mockLoggerApi,
}));

import { GET } from "@/app/api/v1/user/sessions/route";

function req(cookie?: string) {
  return new NextRequest("https://mailguardpro.com/api/v1/user/sessions", {
    method: "GET",
    headers: cookie ? { cookie } : undefined,
  });
}

describe("GET /api/v1/user/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("lists the user's own sessions ordered by expiry", async () => {
    mockPrisma.session.findMany.mockResolvedValue([]);
    await GET(req());
    expect(mockPrisma.session.findMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      orderBy: { expires: "desc" },
      select: { id: true, expires: true, sessionToken: true },
    });
  });

  it("marks the current device and never leaks session tokens", async () => {
    mockPrisma.session.findMany.mockResolvedValue([
      { id: "s1", expires: new Date("2030-01-01T00:00:00.000Z"), sessionToken: "tok-current" },
      { id: "s2", expires: new Date("2031-01-01T00:00:00.000Z"), sessionToken: "tok-other" },
    ]);

    const res = await GET(req("next-auth.session-token=tok-current"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toEqual({
      id: "s1",
      expires: "2030-01-01T00:00:00.000Z",
      isCurrent: true,
    });
    expect(body.data[1].isCurrent).toBe(false);
    // Tokens must never be exposed to the client
    expect(JSON.stringify(body)).not.toContain("tok-");
  });

  it("recognizes the production secure cookie name", async () => {
    mockPrisma.session.findMany.mockResolvedValue([
      { id: "s1", expires: new Date("2030-01-01T00:00:00.000Z"), sessionToken: "tok-current" },
    ]);

    const res = await GET(req("__Secure-next-auth.session-token=tok-current"));
    const body = await res.json();
    expect(body.data[0].isCurrent).toBe(true);
  });

  it("marks no session as current when the cookie is missing", async () => {
    mockPrisma.session.findMany.mockResolvedValue([
      { id: "s1", expires: new Date("2030-01-01T00:00:00.000Z"), sessionToken: "tok-current" },
    ]);

    const res = await GET(req());
    const body = await res.json();
    expect(body.data[0].isCurrent).toBe(false);
  });

  it("returns 500 on unexpected error", async () => {
    mockPrisma.session.findMany.mockRejectedValue(new Error("db down"));
    const res = await GET(req());
    expect(res.status).toBe(500);
  });
});
