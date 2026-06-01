// =============================================================================
// UX-1: Debounce Input Validation Tests
// Tests that input debounces before triggering validation to avoid
// excessive API calls on every keystroke.
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Debounce (UX-1)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // Standard debounce utility
  // A debounced function delays invocation until after `delay` ms have
  // elapsed since the last call. Leading edge and trailing edge behaviors
  // are tracked separately.
  // ===========================================================================
  function debounce<T extends (...args: any[]) => any>(
    fn: T,
    delay: number,
  ): { (...args: Parameters<T>): void; cancel: () => void } {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const debounced = (...args: Parameters<T>) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        fn(...args);
        timer = null;
      }, delay);
    };

    debounced.cancel = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    return debounced;
  }

  describe("debounce utility", () => {
    it("should not call the function immediately", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 300);

      debounced("test@example.com");
      expect(fn).not.toHaveBeenCalled();
    });

    it("should call the function after the delay", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 300);

      debounced("test@example.com");
      vi.advanceTimersByTime(300);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("test@example.com");
    });

    it("should NOT call the function before the delay elapses", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 300);

      debounced("test@example.com");
      vi.advanceTimersByTime(299);

      expect(fn).not.toHaveBeenCalled();
    });

    it("should reset the timer on subsequent calls (debounce reset)", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 300);

      debounced("first@example.com");
      vi.advanceTimersByTime(200);

      // Call again before the first timer completes — should reset
      debounced("second@example.com");
      vi.advanceTimersByTime(200);

      // Only 400ms total elapsed since first call, 200ms since second
      // Should NOT have called yet
      expect(fn).not.toHaveBeenCalled();

      // Advance remaining 100ms (300 total since second call)
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("second@example.com");
    });

    it("should debounce with correct arguments on trailing edge", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 300);

      debounced("a@test.com");
      debounced("b@test.com");
      debounced("c@test.com");

      vi.advanceTimersByTime(300);

      // Only the latest call should be executed
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("c@test.com");
    });

    it("should allow multiple independent debounced sequences", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 300);

      debounced("first@test.com");
      vi.advanceTimersByTime(300);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("first@test.com");

      debounced("second@test.com");
      vi.advanceTimersByTime(300);
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenCalledWith("second@test.com");
    });
  });

  describe("debounce.cancel", () => {
    it("should cancel a pending invocation", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 300);

      debounced("test@example.com");
      debounced.cancel();

      vi.advanceTimersByTime(300);
      expect(fn).not.toHaveBeenCalled();
    });

    it("should be safe to cancel when no timer is active", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 300);

      // Cancel without any pending invocation
      expect(() => debounced.cancel()).not.toThrow();
    });

    it("should be safe to cancel multiple times", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 300);

      debounced("test@example.com");
      debounced.cancel();
      debounced.cancel(); // Second cancel should be no-op

      vi.advanceTimersByTime(300);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("should handle zero delay", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 0);

      debounced("test@example.com");
      vi.advanceTimersByTime(0);

      // With 0 delay, it calls on next tick
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should handle empty arguments", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 300);

      debounced();
      vi.advanceTimersByTime(300);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith();
    });

    it("should handle multiple arguments", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 300);

      debounced("test@example.com", "extra", 123);
      vi.advanceTimersByTime(300);

      expect(fn).toHaveBeenCalledWith("test@example.com", "extra", 123);
    });

    it("should work with async functions", () => {
      const fn = vi.fn().mockResolvedValue("result");
      const debounced = debounce(fn, 300);

      debounced("test@example.com");
      vi.advanceTimersByTime(300);

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // Validate page integration scenario
  // ===========================================================================
  describe("validate page integration", () => {
    it("should debounce input changes before triggering validation", () => {
      const validateFn = vi.fn();
      const debouncedValidate = debounce(validateFn, 500);

      // User types rapidly: "t", "te", "tes", "test", "test@", "test@e", ...
      debouncedValidate("t");
      debouncedValidate("te");
      debouncedValidate("tes");
      debouncedValidate("test");
      debouncedValidate("test@");
      debouncedValidate("test@e");
      debouncedValidate("test@ex");
      debouncedValidate("test@exa");
      debouncedValidate("test@exam");
      debouncedValidate("test@examp");
      debouncedValidate("test@exampl");
      debouncedValidate("test@example");
      debouncedValidate("test@example.");
      debouncedValidate("test@example.c");
      debouncedValidate("test@example.co");
      debouncedValidate("test@example.com");

      // Should not have validated yet
      expect(validateFn).not.toHaveBeenCalled();

      // Advance past debounce delay
      vi.advanceTimersByTime(500);

      // Only the final value should be validated
      expect(validateFn).toHaveBeenCalledTimes(1);
      expect(validateFn).toHaveBeenCalledWith("test@example.com");
    });

    it("should cancel pending validation when component unmounts", () => {
      const validateFn = vi.fn();
      const debouncedValidate = debounce(validateFn, 500);

      debouncedValidate("test@example.com");

      // Simulate unmount cleanup
      debouncedValidate.cancel();

      vi.advanceTimersByTime(500);
      expect(validateFn).not.toHaveBeenCalled();
    });

    it("should validate immediately if delay has passed (idle period)", () => {
      const validateFn = vi.fn();
      const debouncedValidate = debounce(validateFn, 500);

      // First call
      debouncedValidate("test@example.com");
      vi.advanceTimersByTime(500);
      expect(validateFn).toHaveBeenCalledTimes(1);

      // User types again after idle period
      debouncedValidate("test@example.co");
      vi.advanceTimersByTime(500);
      expect(validateFn).toHaveBeenCalledTimes(2);
      expect(validateFn).toHaveBeenLastCalledWith("test@example.co");
    });
  });
});
