import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRedisGet, mockRedisSetex, mockValidateSsrf } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSetex: vi.fn(),
  mockValidateSsrf: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  redis: { get: mockRedisGet, setex: mockRedisSetex },
}));
vi.mock("@/lib/ssrf", () => ({
  validateWebhookUrlWithDns: mockValidateSsrf,
}));

import { checkDisposable, initializeDisposableDomains } from "@/services/disposableChecker";

describe("disposableChecker — initializeDisposableDomains loads from Redis cache", () => {
  beforeAll(async () => {
    vi.clearAllMocks();
    mockRedisGet.mockImplementation((k: string) =>
      k === "disposable:sync:all"
        ? Promise.resolve(JSON.stringify(["fromcache1.com", "fromcache2.com"]))
        : Promise.resolve(null),
    );
    mockRedisSetex.mockResolvedValue("OK");
    await initializeDisposableDomains();
  });

  beforeEach(() => {
    mockRedisGet.mockImplementation((k: string) =>
      k === "disposable:sync:all"
        ? Promise.resolve(JSON.stringify(["fromcache1.com", "fromcache2.com"]))
        : Promise.resolve(null),
    );
  });

  it("should add cached sync domains to the built-in set (detected as disposable)", async () => {
    const result = await checkDisposable("user@fromcache1.com");
    expect(result.passed).toBe(false);
  });

  it("should detect the other cached sync domain", async () => {
    const result = await checkDisposable("user@fromcache2.com");
    expect(result.passed).toBe(false);
  });

  it("should be idempotent (second call is a no-op)", async () => {
    await expect(initializeDisposableDomains()).resolves.toBeUndefined();
  });
});
