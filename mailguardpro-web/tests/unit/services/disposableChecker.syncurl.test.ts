import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockValidateSsrf, mockRedisGet, mockRedisSetex } = vi.hoisted(() => ({
  mockValidateSsrf: vi.fn(),
  mockRedisGet: vi.fn(),
  mockRedisSetex: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  redis: { get: mockRedisGet, setex: mockRedisSetex },
}));
vi.mock("@/lib/ssrf", () => ({
  validateWebhookUrlWithDns: mockValidateSsrf,
}));

const realFetch = globalThis.fetch;
import { checkDisposable, syncDisposableDomains } from "@/services/disposableChecker";

describe("disposableChecker — syncDisposableDomains custom URL SSRF gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSetex.mockResolvedValue("OK");
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("should NOT fetch and return {added:0} when custom URL fails SSRF validation", async () => {
    mockValidateSsrf.mockResolvedValue({ valid: false, error: "blocked" });
    const result = await syncDisposableDomains("https://evil.example/list.txt");
    expect(result).toEqual({ added: 0 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("should fetch and parse domains when custom URL passes SSRF validation", async () => {
    mockValidateSsrf.mockResolvedValue({ valid: true });
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("  A.COM  \n  b.com  \n\n"),
    });
    const result = await syncDisposableDomains("https://safe.example/list.txt");
    expect(result.added).toBe(2);
    // newly synced domains are now detected as disposable
    const check = await checkDisposable("user@a.com");
    expect(check.passed).toBe(false);
  });

  it("should return {added:0} when custom URL fetch is not ok", async () => {
    mockValidateSsrf.mockResolvedValue({ valid: true });
    (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 500 });
    const result = await syncDisposableDomains("https://safe.example/list.txt");
    expect(result).toEqual({ added: 0 });
  });
});
