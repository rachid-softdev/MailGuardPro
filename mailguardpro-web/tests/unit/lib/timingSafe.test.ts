import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enforceTimingSafeResponse, timingSafeEqual } from "@/lib/timingSafe";

describe("timingSafeEqual", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });

  it("returns false for different strings", () => {
    expect(timingSafeEqual("abc123", "abc456")).toBe(false);
  });

  it("returns false for strings of different length", () => {
    expect(timingSafeEqual("short", "longer")).toBe(false);
  });

  it("handles empty strings", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("handles one empty string", () => {
    expect(timingSafeEqual("", "a")).toBe(false);
  });
});

describe("enforceTimingSafeResponse", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits when elapsed time is less than target", async () => {
    vi.useFakeTimers();
    // Start 500ms ago, target is ~3000ms, so should wait ~2500ms
    const startTime = Date.now() - 500;
    const promise = enforceTimingSafeResponse(startTime);

    // Advance past the minimum wait time
    await vi.advanceTimersByTimeAsync(5000);

    await expect(promise).resolves.toBeUndefined();
  }, 10000);

  it("does not wait when elapsed exceeds target plus max jitter", async () => {
    vi.useFakeTimers();
    // Start 4000ms ago, target ~3000ms, jitter up to 500ms
    // So elapsed 4000 > 3000+500=3500, should not wait
    const startTime = Date.now() - 4000;
    const promise = enforceTimingSafeResponse(startTime);

    // Advance a small tick to let any microtasks resolve
    await vi.advanceTimersByTimeAsync(10);

    await expect(promise).resolves.toBeUndefined();
  });

  it("always resolves without throwing", async () => {
    const startTime = Date.now();
    const result = enforceTimingSafeResponse(startTime);
    await expect(result).resolves.toBeUndefined();
  });

  it("handles negative wait time gracefully (jitter causes negative)", async () => {
    // If elapsed > target but within jitter range, should still not wait
    vi.useFakeTimers();
    // Target 3000, jitter up to +/-500. If elapsed = 3200, wait = max(0, 3000 + jitter - 3200)
    // Jitter can be -500 to +500, so wait = max(0, -200 + jitter). If jitter = -500, wait = 0.
    // Elapsed could also be 2700, so wait = max(0, 300 + jitter). If jitter = -500, wait = 0.
    const startTime = Date.now() - 3000;
    const promise = enforceTimingSafeResponse(startTime);
    await vi.advanceTimersByTimeAsync(100);
    await expect(promise).resolves.toBeUndefined();
  });
});
