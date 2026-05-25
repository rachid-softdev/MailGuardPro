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
});
