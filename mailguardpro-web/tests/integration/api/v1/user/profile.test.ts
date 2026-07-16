/**
 * Integration tests for app/api/v1/user/profile/route.ts
 * Covers GET (auth, not-found) and PATCH (CSRF, auth, name validation, success).
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
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  loggerApi: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { NextRequest } from "next/server";
import { GET, PATCH } from "@/app/api/v1/user/profile/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SESSION = { user: { id: "u-1" } };
const ORIGIN = "http://localhost:3000";
const BASE = "https://mailguard.pro/api/v1/user/profile";

describe("GET /api/v1/user/profile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await GET(new NextRequest(BASE, { method: "GET" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the user is not in the database", async () => {
    vi.mocked(auth).mockResolvedValue(SESSION as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const res = await GET(new NextRequest(BASE, { method: "GET" }));
    expect(res.status).toBe(404);
  });

  it("returns the profile for an authenticated user", async () => {
    vi.mocked(auth).mockResolvedValue(SESSION as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u-1",
      name: "Jane",
      email: "jane@x.com",
      plan: "FREE",
      credits: 100,
      createdAt: new Date(),
    });
    const res = await GET(new NextRequest(BASE, { method: "GET" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.email).toBe("jane@x.com");
  });
});

describe("PATCH /api/v1/user/profile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 when CSRF origin/referer is missing", async () => {
    vi.mocked(auth).mockResolvedValue(SESSION as any);
    const req = new NextRequest(BASE, {
      method: "PATCH",
      body: JSON.stringify({ name: "New" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated (valid origin)", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const req = new NextRequest(BASE, {
      method: "PATCH",
      headers: { origin: ORIGIN },
      body: JSON.stringify({ name: "New" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is an empty string", async () => {
    vi.mocked(auth).mockResolvedValue(SESSION as any);
    const req = new NextRequest(BASE, {
      method: "PATCH",
      headers: { origin: ORIGIN },
      body: JSON.stringify({ name: "" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when name exceeds 100 characters", async () => {
    vi.mocked(auth).mockResolvedValue(SESSION as any);
    const req = new NextRequest(BASE, {
      method: "PATCH",
      headers: { origin: ORIGIN },
      body: JSON.stringify({ name: "x".repeat(101) }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("updates the name and returns 200 for a valid request", async () => {
    vi.mocked(auth).mockResolvedValue(SESSION as any);
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: "u-1",
      name: "Updated",
      email: "jane@x.com",
      plan: "FREE",
      credits: 100,
    });
    const req = new NextRequest(BASE, {
      method: "PATCH",
      headers: { origin: ORIGIN },
      body: JSON.stringify({ name: "Updated" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe("Updated");
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u-1" }, data: { name: "Updated" } }),
    );
  });

  it("applies a no-op update when no name is supplied", async () => {
    vi.mocked(auth).mockResolvedValue(SESSION as any);
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: "u-1",
      name: "Jane",
      email: "jane@x.com",
      plan: "FREE",
      credits: 100,
    });
    const req = new NextRequest(BASE, {
      method: "PATCH",
      headers: { origin: ORIGIN },
      body: JSON.stringify({}),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: {} }));
  });
});
