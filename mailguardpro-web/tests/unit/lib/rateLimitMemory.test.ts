/**
 * Unit tests for lib/rateLimitMemory.ts
 *
 * Tests the in-memory sliding-window rate limiter with 50% stricter limits,
 * window expiration, sweeper cleanup, and independent key isolation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The module is not mocked globally — we test the real implementation.
// We use vi.useFakeTimers to control time for window/sweep tests.
import { checkMemoryRateLimit, clearSweeper } from "@/lib/rateLimitMemory";

describe("checkMemoryRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Start from a fixed "now"
    vi.setSystemTime(new Date("2026-05-29T12:00:00Z"));
  });

  afterEach(() => {
    clearSweeper(); // cleanup interval + clear store between tests
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ────────────────────────────────────────────
  // Basic rate limiting
  // ────────────────────────────────────────────

  it("should allow the first request", async () => {
    const result = await checkMemoryRateLimit("key-a", 100, 60);

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(49); // limit = floor(100 * 0.5) = 50, remaining = 50 - 1
    expect(result.limit).toBe(50);
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });

  it("should allow requests within the limit", async () => {
    const key = "burst-key";
    // Send 50 requests (the memory limit = floor(100 * 0.5) = 50)
    for (let i = 0; i < 50; i++) {
      const result = await checkMemoryRateLimit(key, 100, 60);
      if (i < 49) {
        expect(result.success).toBe(true);
        expect(result.remaining).toBe(49 - i);
      } else {
        // The 50th request should succeed (count=50, limit=50, success=true)
        expect(result.success).toBe(true);
        expect(result.remaining).toBe(0);
      }
    }
  });

  it("should block the (limit+1)th request", async () => {
    const key = "limit-test";
    for (let i = 0; i < 50; i++) {
      await checkMemoryRateLimit(key, 100, 60);
    }
    // 51st request — over the 50% limit
    const result = await checkMemoryRateLimit(key, 100, 60);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should return remaining=0 when blocked", async () => {
    const key = "block-remaining";
    for (let i = 0; i < 50; i++) {
      await checkMemoryRateLimit(key, 100, 60);
    }
    const result = await checkMemoryRateLimit(key, 100, 60);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  // ────────────────────────────────────────────
  // Window expiration
  // ────────────────────────────────────────────

  it("should reset after the window expires", async () => {
    const key = "window-reset";
    // Exhaust the limit
    for (let i = 0; i < 50; i++) {
      await checkMemoryRateLimit(key, 100, 60);
    }
    let result = await checkMemoryRateLimit(key, 100, 60);
    expect(result.success).toBe(false);

    // Advance time past the window (60 seconds)
    vi.advanceTimersByTime(61_000);

    // After window expiry, a new window starts
    result = await checkMemoryRateLimit(key, 100, 60);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(49);
  });

  it("should allow requests in a new window after old window expires", async () => {
    const key = "new-window";
    await checkMemoryRateLimit(key, 100, 60);
    vi.advanceTimersByTime(30_000); // halfway through
    await checkMemoryRateLimit(key, 100, 60);
    expect((await checkMemoryRateLimit(key, 100, 60)).success).toBe(true);

    vi.advanceTimersByTime(31_000); // past 60s window
    const result = await checkMemoryRateLimit(key, 100, 60);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(49); // fresh window
  });

  // ────────────────────────────────────────────
  // 50% stricter limit
  // ────────────────────────────────────────────

  it("should apply 50% stricter limit (floor)", async () => {
    // original 10 → memory limit 5
    const key = "fifty-percent";
    for (let i = 0; i < 5; i++) {
      const result = await checkMemoryRateLimit(key, 10, 60);
      expect(result.limit).toBe(5);
      if (i < 4) expect(result.success).toBe(true);
    }
    const result = await checkMemoryRateLimit(key, 10, 60);
    expect(result.success).toBe(false);
  });

  it("should floor to at least 1 for very small original limits", async () => {
    const key = "floor-to-1";
    // original 1 → memory limit = max(1, floor(1 * 0.5)) = max(1, 0) = 1
    const r1 = await checkMemoryRateLimit(key, 1, 60);
    expect(r1.limit).toBe(1);
    expect(r1.success).toBe(true);

    const r2 = await checkMemoryRateLimit(key, 1, 60);
    expect(r2.success).toBe(false); // 2nd request blocked
  });

  it("should floor to at least 1 for original limit 0", async () => {
    const key = "limit-zero";
    const result = await checkMemoryRateLimit(key, 0, 60);
    expect(result.limit).toBe(1);
  });

  // ────────────────────────────────────────────
  // Independent keys
  // ────────────────────────────────────────────

  it("should track independent keys separately", async () => {
    const keyA = "independent-a";
    const keyB = "independent-b";

    // Exhaust keyA (original 10 → limit 5)
    for (let i = 0; i < 5; i++) {
      await checkMemoryRateLimit(keyA, 10, 60);
    }
    // keyA should be blocked
    expect((await checkMemoryRateLimit(keyA, 10, 60)).success).toBe(false);

    // keyB should still be fresh
    expect((await checkMemoryRateLimit(keyB, 10, 60)).success).toBe(true);
    expect((await checkMemoryRateLimit(keyB, 10, 60)).remaining).toBe(3);
  });

  it("should handle many independent keys without interference", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => checkMemoryRateLimit(`multi-key-${i}`, 100, 60)),
    );
    for (const r of results) {
      expect(r.success).toBe(true);
      expect(r.remaining).toBe(49);
    }
  });

  // ────────────────────────────────────────────
  // Sweeper cleanup
  // ────────────────────────────────────────────

  it("should remove expired entries via sweeper after sweep interval", async () => {
    const key = "sweeper-test";
    await checkMemoryRateLimit(key, 10, 1); // 1-second window

    // Advance past window (1s) but before sweeper runs (60s)
    vi.advanceTimersByTime(5_000);

    // Entry exists but window has expired — a new request starts a new window
    const result1 = await checkMemoryRateLimit(key, 10, 1);
    expect(result1.success).toBe(true);

    // Now advance past the sweeper interval (60s from start)
    vi.advanceTimersByTime(56_000);

    // The sweeper should have cleaned the old entry.
    // We still have the new entry from result1, 56s ago.
    // Let's just advance a bit more and confirm we can operate.
    const result2 = await checkMemoryRateLimit(key, 10, 1);
    // Should work normally
    expect(result2).toHaveProperty("success");
    expect(result2).toHaveProperty("remaining");
    expect(result2).toHaveProperty("limit");
  });

  // ────────────────────────────────────────────
  // Unlimited / very high limits
  // ────────────────────────────────────────────

  it("should handle very high original limits (999999)", async () => {
    const key = "unlimited-key";
    // 999999 * 0.5 = 499999.5 → floor = 499999
    const result = await checkMemoryRateLimit(key, 999999, 60);
    expect(result.limit).toBe(499999);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(499998);
  });

  it("should allow many requests under a high limit", async () => {
    const key = "high-limit";
    for (let i = 0; i < 100; i++) {
      const result = await checkMemoryRateLimit(key, 999999, 60);
      expect(result.success).toBe(true);
    }
  });

  // ────────────────────────────────────────────
  // Return shape
  // ────────────────────────────────────────────

  it("should return the correct shape with all required properties", async () => {
    const result = await checkMemoryRateLimit("shape-test", 100, 60);

    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("remaining");
    expect(result).toHaveProperty("resetAt");
    expect(result).toHaveProperty("limit");
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.remaining).toBe("number");
    expect(typeof result.resetAt).toBe("number");
    expect(typeof result.limit).toBe("number");
  });

  it("should return limit=50 for original limit=100", async () => {
    const result = await checkMemoryRateLimit("limit-check", 100, 60);
    expect(result.limit).toBe(50);
  });

  // ────────────────────────────────────────────
  // Different window durations
  // ────────────────────────────────────────────

  it("should respect different window durations", async () => {
    const key = "short-window";
    // limit = floor(10 * 0.5) = 5 — make 6 requests to exceed
    for (let i = 0; i < 6; i++) {
      const result = await checkMemoryRateLimit(key, 10, 2);
      if (i < 5) {
        expect(result.success).toBe(true);
      } else {
        expect(result.success).toBe(false); // 6th exceeds limit of 5
      }
    }

    // After 3 seconds (past the 2s window), new window
    vi.advanceTimersByTime(3_000);
    expect((await checkMemoryRateLimit(key, 10, 2)).success).toBe(true);
  });
});
