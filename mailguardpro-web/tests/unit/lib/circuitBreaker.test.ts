import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock pino logger before importing CircuitBreaker
vi.mock("pino", () => ({
  __esModule: true,
  default: vi.fn(() => ({
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { CircuitBreaker } from "@/lib/circuitBreaker";

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    breaker = new CircuitBreaker({
      name: "test-breaker",
      failureThreshold: 3,
      successThreshold: 2,
      timeoutMs: 10000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ──────────────── Initial state ────────────────

  it("should start in CLOSED state", () => {
    expect(breaker.getState()).toBe("CLOSED");
  });

  it("should use default options when none provided", () => {
    const defaultBreaker = new CircuitBreaker();
    // Call getState just to verify it was constructed
    expect(defaultBreaker.getState()).toBe("CLOSED");
  });

  // ──────────────── CLOSED state: success ────────────────

  it("should execute the function and return result when CLOSED", async () => {
    const result = await breaker.execute(
      async () => "success-result",
      async () => "fallback",
    );

    expect(result).toBe("success-result");
    expect(breaker.getState()).toBe("CLOSED");
  });

  it("should reset failure count on success", async () => {
    // Fail twice
    await breaker.execute(
      async () => {
        throw new Error("fail");
      },
      async () => "fallback",
    );
    await breaker.execute(
      async () => {
        throw new Error("fail");
      },
      async () => "fallback",
    );

    // Succeed
    await breaker.execute(
      async () => "success",
      async () => "fallback",
    );

    // Now fail once — should stay CLOSED (failureCount was reset to 0)
    const result = await breaker.execute(
      async () => {
        throw new Error("fail");
      },
      async () => "fallback",
    );

    expect(result).toBe("fallback");
    expect(breaker.getState()).toBe("CLOSED");
  });

  // ──────────────── CLOSED → OPEN transition ────────────────

  it("should remain CLOSED when failures are below threshold", async () => {
    // failureThreshold = 3, so fail twice
    await breaker.execute(
      async () => {
        throw new Error("fail");
      },
      async () => "fallback1",
    );
    await breaker.execute(
      async () => {
        throw new Error("fail");
      },
      async () => "fallback2",
    );

    expect(breaker.getState()).toBe("CLOSED");
  });

  it("should transition to OPEN when failure threshold is reached", async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.execute(
        async () => {
          throw new Error("fail");
        },
        async () => "fallback",
      );
    }

    expect(breaker.getState()).toBe("OPEN");
  });

  it("should return fallback on each failure", async () => {
    const result = await breaker.execute(
      async () => {
        throw new Error("fail");
      },
      async () => "fallback-value",
    );

    expect(result).toBe("fallback-value");
  });

  // ──────────────── OPEN state ────────────────

  it("should return fallback when OPEN and timeout has not elapsed", async () => {
    // Reach OPEN state
    for (let i = 0; i < 3; i++) {
      await breaker.execute(
        async () => {
          throw new Error("fail");
        },
        async () => "fallback",
      );
    }

    expect(breaker.getState()).toBe("OPEN");

    // Advance time halfway through timeout
    vi.advanceTimersByTime(5000);

    // Should still be OPEN, return fallback without calling fn
    const fnSpy = vi.fn().mockResolvedValue("should-not-call");
    const result = await breaker.execute(fnSpy, async () => "fallback-in-open");

    expect(result).toBe("fallback-in-open");
    expect(fnSpy).not.toHaveBeenCalled();
    expect(breaker.getState()).toBe("OPEN");
  });

  // ──────────────── OPEN → HALF_OPEN ────────────────

  it("should transition to HALF_OPEN after timeout elapses", async () => {
    // Reach OPEN state
    for (let i = 0; i < 3; i++) {
      await breaker.execute(
        async () => {
          throw new Error("fail");
        },
        async () => "fallback",
      );
    }

    expect(breaker.getState()).toBe("OPEN");

    // Advance past timeout
    vi.advanceTimersByTime(10000);

    // Next call should try the function (HALF_OPEN)
    const fnSpy = vi.fn().mockResolvedValue("success");
    const result = await breaker.execute(fnSpy, async () => "fallback");

    expect(result).toBe("success");
    expect(fnSpy).toHaveBeenCalledOnce();
    expect(breaker.getState()).toBe("HALF_OPEN"); // One success, needs 2
  });

  // ──────────────── HALF_OPEN → CLOSED ────────────────

  it("should transition from HALF_OPEN to CLOSED after enough successes", async () => {
    // Reach OPEN state
    for (let i = 0; i < 3; i++) {
      await breaker.execute(
        async () => {
          throw new Error("fail");
        },
        async () => "fallback",
      );
    }

    // Advance past timeout
    vi.advanceTimersByTime(10000);

    // First success → HALF_OPEN
    await breaker.execute(
      async () => "success1",
      async () => "fallback",
    );
    expect(breaker.getState()).toBe("HALF_OPEN");

    // Second success → CLOSED (successThreshold = 2)
    await breaker.execute(
      async () => "success2",
      async () => "fallback",
    );
    expect(breaker.getState()).toBe("CLOSED");
  });

  it("should reset success count in HALF_OPEN on a failure and need enough failures to go back to OPEN", async () => {
    // Reach OPEN state
    for (let i = 0; i < 3; i++) {
      await breaker.execute(
        async () => {
          throw new Error("fail");
        },
        async () => "fallback",
      );
    }

    // Advance past timeout
    vi.advanceTimersByTime(10000);

    // First success → HALF_OPEN (onSuccess resets failureCount to 0)
    await breaker.execute(
      async () => "success1",
      async () => "fallback",
    );
    expect(breaker.getState()).toBe("HALF_OPEN");

    // Then fail — onSuccess already reset failureCount to 0,
    // so onFailure increments it to 1 (need 3 to reach OPEN)
    await breaker.execute(
      async () => {
        throw new Error("fail");
      },
      async () => "fallback",
    );
    // Still HALF_OPEN because failureCount (1) < failureThreshold (3)
    expect(breaker.getState()).toBe("HALF_OPEN");

    // Need 2 more failures to reach OPEN
    await breaker.execute(
      async () => {
        throw new Error("fail2");
      },
      async () => "fallback",
    );
    await breaker.execute(
      async () => {
        throw new Error("fail3");
      },
      async () => "fallback",
    );
    expect(breaker.getState()).toBe("OPEN");
  });

  // ──────────────── Reset ────────────────

  it("should reset to CLOSED state with zero counters", async () => {
    // Reach OPEN state first
    for (let i = 0; i < 3; i++) {
      await breaker.execute(
        async () => {
          throw new Error("fail");
        },
        async () => "fallback",
      );
    }

    expect(breaker.getState()).toBe("OPEN");

    breaker.reset();

    expect(breaker.getState()).toBe("CLOSED");
  });

  it("should work normally after reset", async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.execute(
        async () => {
          throw new Error("fail");
        },
        async () => "fallback",
      );
    }

    breaker.reset();

    const result = await breaker.execute(
      async () => "post-reset-success",
      async () => "fallback",
    );
    expect(result).toBe("post-reset-success");
    expect(breaker.getState()).toBe("CLOSED");
  });

  // ──────────────── Edge cases ────────────────

  it("should handle custom thresholds", () => {
    const customBreaker = new CircuitBreaker({
      failureThreshold: 1,
      successThreshold: 1,
      timeoutMs: 5000,
    });

    expect(customBreaker.getState()).toBe("CLOSED");
  });

  it("should handle concurrent calls gracefully", async () => {
    // Fire multiple calls that all fail
    const results = await Promise.all([
      breaker.execute(
        async () => {
          throw new Error("fail1");
        },
        async () => "fb1",
      ),
      breaker.execute(
        async () => {
          throw new Error("fail2");
        },
        async () => "fb2",
      ),
      breaker.execute(
        async () => {
          throw new Error("fail3");
        },
        async () => "fb3",
      ),
    ]);

    expect(results).toEqual(["fb1", "fb2", "fb3"]);
    // After 3 failures, circuit should be OPEN
    expect(breaker.getState()).toBe("OPEN");
  });

  it("should handle function exceptions (not just rejections)", async () => {
    const result = await breaker.execute(
      async () => {
        throw new Error("sync-error");
      },
      async () => "fallback-ok",
    );

    expect(result).toBe("fallback-ok");
  });

  it("should propagate errors through fallback", async () => {
    const result = await breaker.execute(
      async () => {
        throw new Error("fn-error");
      },
      async () => "fallback-result",
    );

    expect(result).toBe("fallback-result");
  });
});
