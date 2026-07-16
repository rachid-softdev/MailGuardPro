import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRedisGet, mockRedisSetex } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSetex: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  redis: { get: mockRedisGet, setex: mockRedisSetex },
}));

import { checkDisposable } from "@/services/disposableChecker";

describe("disposableChecker — Redis cache hit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSetex.mockResolvedValue("OK");
  });

  it("should return failed (provider:cache) when Redis cache holds '1'", async () => {
    mockRedisGet.mockImplementation((k: string) =>
      k === "disposable:tempmail.com" ? Promise.resolve("1") : Promise.resolve(null),
    );
    const result = await checkDisposable("user@tempmail.com");
    expect(result.passed).toBe(false);
    expect(result.message).toBe("Email jetable");
    expect((result as any).provider).toBe("cache");
    // cache hit must NOT trigger a write-back
    expect(mockRedisSetex).not.toHaveBeenCalled();
  });

  it("should return passed (provider undefined) when Redis cache holds '0'", async () => {
    mockRedisGet.mockImplementation((k: string) =>
      k === "disposable:gmail.com" ? Promise.resolve("0") : Promise.resolve(null),
    );
    const result = await checkDisposable("user@gmail.com");
    expect(result.passed).toBe(true);
    expect(result.message).toBe("Email non-jetable");
    expect((result as any).provider).toBeUndefined();
    expect(mockRedisSetex).not.toHaveBeenCalled();
  });
});
