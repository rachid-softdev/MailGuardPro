import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { AuthError, requireAdmin } from "@/lib/auth/require-admin";

describe("requireAdmin", () => {
  it("should return user data for authenticated admin", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", email: "admin@test.com", role: "ADMIN" },
    } as any);
    const result = await requireAdmin();
    expect(result).toEqual({ id: "user-1", email: "admin@test.com" });
  });

  it("should throw AuthError 403 for non-admin user", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", email: "user@test.com", role: "USER" },
    } as any);
    await expect(requireAdmin()).rejects.toThrow(AuthError);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
  });

  it("should throw AuthError 401 when no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
  });

  it("should throw AuthError 401 when session has no user id", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { email: "test@test.com", role: "ADMIN" },
    } as any);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
  });

  it("should return empty string email when user email is null", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", email: null, role: "ADMIN" },
    } as any);
    const result = await requireAdmin();
    expect(result).toEqual({ id: "user-1", email: "" });
  });

  it("should return user data when roles array contains ADMIN (multi-role format)", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "1", email: "a@b.com", roles: ["ADMIN"] },
    } as any);
    const result = await requireAdmin();
    expect(result).toEqual({ id: "1", email: "a@b.com" });
  });

  it("should allow access when at least one format has ADMIN despite conflict", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "1", role: "USER", roles: ["ADMIN"] },
    } as any);
    const result = await requireAdmin();
    expect(result).toEqual({ id: "1", email: "" });
  });

  it("should throw AuthError 403 when roles array is empty and role is not ADMIN", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "1", role: "USER", roles: [] },
    } as any);
    await expect(requireAdmin()).rejects.toThrow(AuthError);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
  });

  it("should throw AuthError 403 when roles array has other roles but not ADMIN", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "1", role: "USER", roles: ["USER", "MODERATOR"] },
    } as any);
    await expect(requireAdmin()).rejects.toThrow(AuthError);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
  });

  it("should throw AuthError 401 when session.user is null", async () => {
    vi.mocked(auth).mockResolvedValue({ user: null } as any);
    await expect(requireAdmin()).rejects.toThrow(AuthError);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
  });

  it("should throw AuthError 401 when session is an empty object", async () => {
    vi.mocked(auth).mockResolvedValue({} as any);
    await expect(requireAdmin()).rejects.toThrow(AuthError);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
  });

  it("should propagate error when auth() throws unexpectedly", async () => {
    vi.mocked(auth).mockRejectedValue(new Error("Auth provider error"));
    await expect(requireAdmin()).rejects.toThrow(Error);
    await expect(requireAdmin()).rejects.toThrow("Auth provider error");
  });

  it("should throw AuthError 403 when role is lowercase 'admin' (case sensitive)", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "1", role: "admin" },
    } as any);
    await expect(requireAdmin()).rejects.toThrow(AuthError);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
  });
});
