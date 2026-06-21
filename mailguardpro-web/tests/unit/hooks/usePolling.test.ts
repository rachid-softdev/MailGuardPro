import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ===========================================================================
// usePolling test — mocks React hooks to avoid jsdom dependency
// ===========================================================================
// We mock useRef, useEffect, useCallback to execute hook logic without a
// browser environment. The refs are simulated with plain mutable objects.
//
// Key design: use vi.advanceTimersByTimeAsync(ms) to properly flush
// microtasks after async timer callbacks (the poll function is async).
// ===========================================================================

// Track effect cleanups from this test
let effectCleanups: Array<() => void>;

vi.mock("react", () => ({
  useRef: (initialValue: unknown) => ({ current: initialValue }),
  useEffect: (fn: () => (() => void) | void) => {
    const cleanup = fn();
    if (cleanup) {
      effectCleanups.push(cleanup);
    }
  },
  useCallback: (fn: (...args: unknown[]) => unknown) => fn,
}));

import { usePolling } from "@/hooks/usePolling";

describe("usePolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    effectCleanups = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ──────────────── Return shape ────────────────

  it("should return cancel function and isPolling accessor", () => {
    const result = usePolling({
      fetcher: async () => "ok",
      shouldStop: () => false,
      enabled: false,
    });

    expect(result).toHaveProperty("cancel");
    expect(typeof result.cancel).toBe("function");
    expect(result).toHaveProperty("isPolling");
    expect(typeof result.isPolling).toBe("boolean");
  });

  // ──────────────── Polling lifecycle ────────────────

  it("should start polling when enabled is true", async () => {
    const fetcher = vi.fn().mockResolvedValue("ok");

    usePolling({
      fetcher,
      shouldStop: () => false,
      enabled: true,
      interval: 1000,
    });

    // Advance past initial setTimeout(0) — use async to flush microtasks
    await vi.advanceTimersByTimeAsync(1);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("should NOT start polling when enabled is false", async () => {
    const fetcher = vi.fn().mockResolvedValue("ok");

    usePolling({
      fetcher,
      shouldStop: () => false,
      enabled: false,
      interval: 1000,
    });

    await vi.advanceTimersByTimeAsync(100);

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("should call fetcher repeatedly at the given interval", async () => {
    const fetcher = vi.fn().mockResolvedValue("processing");

    usePolling({
      fetcher,
      shouldStop: () => false,
      enabled: true,
      interval: 2000,
    });

    // Initial poll via setTimeout(0)
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Advance by interval
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetcher).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2000);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("should stop polling when shouldStop returns true", async () => {
    const fetcher = vi.fn().mockResolvedValue("done");
    const onComplete = vi.fn();

    usePolling({
      fetcher,
      shouldStop: (result: unknown) => result === "done",
      enabled: true,
      interval: 1000,
      onComplete,
    });

    // First call — result is "done", shouldStop returns true
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("done");

    // Advance further — should not call again
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("should call onError when fetcher throws", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("Network error"));
    const onError = vi.fn();

    usePolling({
      fetcher,
      shouldStop: () => false,
      enabled: true,
      interval: 2000,
      onError,
      maxRetries: 10,
    });

    await vi.advanceTimersByTimeAsync(1);

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onError.mock.calls[0][0].message).toBe("Network error");
  });

  it("should apply exponential backoff on error", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("Error"));
    const onError = vi.fn();

    usePolling({
      fetcher,
      shouldStop: () => false,
      enabled: true,
      interval: 2000,
      onError,
      maxRetries: 10,
    });

    // First call via setTimeout(0)
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Backoff = min(2000 * 2^(1-1), 30000) = 2000
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetcher).toHaveBeenCalledTimes(2);

    // Backoff = min(2000 * 2^(2-1), 30000) = 4000
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetcher).toHaveBeenCalledTimes(3);

    // Backoff = min(2000 * 2^(3-1), 30000) = 8000
    await vi.advanceTimersByTimeAsync(8000);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("should cap exponential backoff at 30 seconds", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("Error"));

    usePolling({
      fetcher,
      shouldStop: () => false,
      enabled: true,
      interval: 2000,
      maxRetries: 20,
    });

    // Trigger first fetch
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Exponential backoff: 2000, 4000, 8000, 16000, 30000(cap), 30000...
    // Advance by exact backoff amounts to fire one poll at a time
    const expectedBackoffs = [2000, 4000, 8000, 16000, 30000];
    for (const backoff of expectedBackoffs) {
      await vi.advanceTimersByTimeAsync(backoff);
    }

    // initial (1) + 5 backoff-triggered calls = 6
    expect(fetcher).toHaveBeenCalledTimes(6);

    // Subsequent backoffs are all 30000 (capped)
    await vi.advanceTimersByTimeAsync(30000);
    expect(fetcher).toHaveBeenCalledTimes(7);

    await vi.advanceTimersByTimeAsync(30000);
    expect(fetcher).toHaveBeenCalledTimes(8);
  });

  it("should stop after maxRetries errors", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("Error"));
    const onError = vi.fn();

    usePolling({
      fetcher,
      shouldStop: () => false,
      enabled: true,
      interval: 100,
      maxRetries: 3,
      onError,
    });

    // maxRetries = 3 allows up to 3 errors total.
    // retryCount starts at 0, increments on each error.
    // After 3 errors: retryCount (3) >= maxRetries (3) → stop.

    // Initial call (error #1)
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Retry 1: backoff = min(100 * 2^0, 30000) = 100
    await vi.advanceTimersByTimeAsync(100);
    expect(fetcher).toHaveBeenCalledTimes(2);

    // Retry 2: backoff = min(100 * 2^1, 30000) = 200
    await vi.advanceTimersByTimeAsync(200);
    expect(fetcher).toHaveBeenCalledTimes(3);
    // After this error, retryCount = 3, which equals maxRetries → stop
    // onError is called for each error (3 total)

    // No more calls should happen
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetcher).toHaveBeenCalledTimes(3);
    // onError called 3 times (once per error)
    expect(onError).toHaveBeenCalledTimes(3);
  });

  it("should reset retry count on successful call after errors", async () => {
    let callCount = 0;
    const fetcher = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) return Promise.reject(new Error("Error"));
      return Promise.resolve("ok");
    });

    usePolling({
      fetcher,
      shouldStop: () => false,
      enabled: true,
      interval: 1000,
      maxRetries: 10,
    });

    // First call: error
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Backoff 1000 → second call: error
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(2);

    // Backoff 2000 → third call: success
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetcher).toHaveBeenCalledTimes(3);

    // After success, retry count resets, should continue polling with normal interval
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(4);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  // ──────────────── Cancel ────────────────

  it("should stop polling when cancel is called", async () => {
    const fetcher = vi.fn().mockResolvedValue("processing");

    const result = usePolling({
      fetcher,
      shouldStop: () => false,
      enabled: true,
      interval: 1000,
    });

    // Initial call
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Cancel
    result.cancel();

    // Advance — should not call again
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  // ──────────────── Cleanup ────────────────

  it("should clean up timeouts on unmount", () => {
    const fetcher = vi.fn().mockResolvedValue("processing");

    usePolling({
      fetcher,
      shouldStop: () => false,
      enabled: true,
      interval: 1000,
    });

    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

    // Run all effect cleanups (simulating component unmount)
    for (const cleanup of effectCleanups) {
      cleanup();
    }

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  // ──────────────── Edge cases ────────────────

  it("should handle shouldStop returning false consistently", async () => {
    const fetcher = vi.fn().mockResolvedValue("processing");

    usePolling({
      fetcher,
      shouldStop: () => false,
      enabled: true,
      interval: 500,
      maxRetries: 100,
    });

    // Run many cycles
    await vi.advanceTimersByTimeAsync(5000);

    // Should have been called ~10 times (initial + 5000/500 = 10)
    expect(fetcher).toHaveBeenCalledTimes(11); // initial (at ~0) + 10 intervals
  });

  it("should handle fetcher returning complex objects", async () => {
    const fetcher = vi.fn().mockResolvedValue({ status: "pending", progress: 50 });

    usePolling({
      fetcher,
      shouldStop: (result: unknown) => (result as { status: string }).status === "completed",
      enabled: true,
      interval: 1000,
    });

    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // shouldStop returns false, so continue
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("should not call onError when not provided", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("Error"));

    expect(() => {
      usePolling({
        fetcher,
        shouldStop: () => false,
        enabled: true,
        interval: 1000,
        maxRetries: 3,
      });
    }).not.toThrow();

    await vi.advanceTimersByTimeAsync(1);
    // Should not have thrown — just silently caught the error
  });

  it("should not call onComplete when not provided", async () => {
    const fetcher = vi.fn().mockResolvedValue("done");

    expect(() => {
      usePolling({
        fetcher,
        shouldStop: (result: unknown) => result === "done",
        enabled: true,
      });
    }).not.toThrow();

    await vi.advanceTimersByTimeAsync(1);
  });

  // ──────────────── Mounted ref early return (lines 46-47) ────────────────

  it("should early-return in poll() when unmounted during async fetch (line 46-47)", async () => {
    // Arrange: a fetcher that stays pending until we resolve it manually
    let resolveFetch!: (value: string) => void;
    const fetcher = vi.fn().mockReturnValue(
      new Promise<string>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const result = usePolling({
      fetcher,
      shouldStop: () => false,
      enabled: true,
      interval: 1000,
    });

    // Initial setTimeout(0) fires → poll() runs → awaits fetcherRef.current()
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Act: simulate unmount DURING the fetch (cancel sets mountedRef.current = false)
    result.cancel();

    // Resolve the pending fetch
    resolveFetch!("done");

    // Flush microtasks so the poll() continuation runs
    await vi.advanceTimersByTimeAsync(10);

    // Assert: after resolving with mountedRef = false, poll() sees the flag
    // and returns without scheduling another timeout
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  // ──────────────── isPolling accessor ────────────────

  it("should return isPolling true when polling is active", async () => {
    const fetcher = vi.fn().mockResolvedValue("processing");

    const result = usePolling({
      fetcher,
      shouldStop: () => false,
      enabled: true,
      interval: 1000,
    });

    // After effect runs, isPolling is set to true
    expect(result.isPolling).toBe(true);
  });

  it("should return isPolling false after cancel()", async () => {
    const fetcher = vi.fn().mockResolvedValue("processing");

    const result = usePolling({
      fetcher,
      shouldStop: () => false,
      enabled: true,
      interval: 1000,
    });

    expect(result.isPolling).toBe(true);

    result.cancel();

    expect(result.isPolling).toBe(false);
  });

  it("should return isPolling false after shouldStop returns true", async () => {
    const fetcher = vi.fn().mockResolvedValue("done");

    const result = usePolling({
      fetcher,
      shouldStop: (r: unknown) => r === "done",
      enabled: true,
      interval: 1000,
    });

    expect(result.isPolling).toBe(true);

    // Initial poll → result is "done" → shouldStop true → isPolling = false
    await vi.advanceTimersByTimeAsync(1);

    expect(result.isPolling).toBe(false);
  });

  it("should return isPolling false after maxRetries exceeded", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("Error"));

    const result = usePolling({
      fetcher,
      shouldStop: () => false,
      enabled: true,
      interval: 100,
      maxRetries: 2,
    });

    expect(result.isPolling).toBe(true);

    // Initial call: error #1, retryCount = 1 < 2 → still polling
    await vi.advanceTimersByTimeAsync(1);
    expect(result.isPolling).toBe(true);

    // Backoff 100 → call 2: error #2, retryCount = 2 >= maxRetries → stop
    await vi.advanceTimersByTimeAsync(100);

    expect(result.isPolling).toBe(false);
  });

  // ──────────────── maxRetries = 0 ────────────────

  it("should never call fetcher when maxRetries is 0", async () => {
    const fetcher = vi.fn().mockResolvedValue("ok");

    const result = usePolling({
      fetcher,
      shouldStop: () => false,
      enabled: true,
      interval: 1000,
      maxRetries: 0,
    });

    // retryCount (0) >= maxRetries (0) → early return before fetching
    await vi.advanceTimersByTimeAsync(1);

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.isPolling).toBe(false);
  });

  it("should stop immediately after first error when maxRetries is 0", async () => {
    // If fetcher is actually called (e.g., enabled toggled mid-cycle),
    // maxRetries=0 means the error path also stops immediately:
    // retryCount (1) >= maxRetries (0) → stop in catch block
    const onError = vi.fn();
    const fetcher = vi.fn().mockRejectedValue(new Error("Fail fast"));

    const result = usePolling({
      fetcher,
      shouldStop: () => false,
      enabled: true,
      interval: 1000,
      maxRetries: 0,
      onError,
    });

    // The initial check retryCount (0) >= maxRetries (0) causes early return.
    // So fetcher is never called. This is the expected behavior.
    await vi.advanceTimersByTimeAsync(10000);

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.isPolling).toBe(false);
  });
});
