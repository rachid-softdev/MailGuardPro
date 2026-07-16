/**
 * Integration tests for app/api/admin/users/route.ts
 * Covers admin authorization (requireAdmin 401/403), validation, and success paths.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  loggerApi: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/admin/users/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_SESSION = {
  user: { id: "admin-1", email: "admin@x.com", roles: ["ADMIN" as const], role: "ADMIN" as const },
};
const NON_ADMIN_SESSION = {
  user: { id: "user-1", email: "user@x.com", roles: ["USER" as const], role: "USER" as const },
};

function adminGetRequest() {
  return new NextRequest("https://mailguard.pro/api/admin/users", { method: "GET" });
}
function adminPostRequest(body: unknown) {
  return new NextRequest("https://mailguard.pro/api/admin/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/admin/users", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 when the caller is a non-admin user", async () => {
    vi.mocked(auth).mockResolvedValue(NON_ADMIN_SESSION as any);
    const res = await GET(adminGetRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("administrateur");
  });

  it("returns 401 when there is no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await GET(adminGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns 200 with the user list for an admin", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "u1", name: "A", email: "a@x.com", role: "USER", userRoles: [{ role: "USER" }], createdAt: new Date() },
    ]);
    vi.mocked(prisma.user.count).mockResolvedValue(1);
    const res = await GET(adminGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
  });
});

describe("POST /api/admin/users", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 when the caller is a non-admin user", async () => {
    vi.mocked(auth).mockResolvedValue(NON_ADMIN_SESSION as any);
    const res = await POST(adminPostRequest({ email: "new@x.com", roles: ["USER"] }));
    expect(res.status).toBe(403);
  });

  it("returns 401 when there is no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await POST(adminPostRequest({ email: "new@x.com", roles: ["USER"] }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid email", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION as any);
    const res = await POST(adminPostRequest({ email: "not-an-email", roles: ["USER"] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation error");
  });

  it("returns 400 when roles array is empty (min 1)", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION as any);
    const res = await POST(adminPostRequest({ email: "new@x.com", roles: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details.roles).toBeDefined();
  });

  it("creates a user and returns 201 for a valid admin request", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION as any);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "new-1",
      email: "new@x.com",
      name: undefined,
      role: "USER",
      userRoles: [{ role: "USER" }],
    });
    const res = await POST(adminPostRequest({ email: "new@x.com", roles: ["USER"] }));
    expect(res.status).toBe(201);
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });
});
