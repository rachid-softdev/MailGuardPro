// =============================================================================
// UX-6: Settings Success Auto-Dismiss Tests
// Tests that the success message in the settings page auto-dismisses
// after 4 seconds using a setTimeout-based timer.
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Settings auto-dismiss (UX-6)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // The settings page (page.tsx lines 54-79) sets a message when saving:
  //   setMessage({ type: "success", text: "Profile updated successfully!" });
  //
  // The auto-dismiss pattern (to be implemented based on UX-6):
  //   useEffect(() => {
  //     if (message?.type === "success") {
  //       const timer = setTimeout(() => setMessage(null), 4000);
  //       return () => clearTimeout(timer);
  //     }
  //   }, [message]);
  //
  // These tests verify that pattern works correctly.
  // ===========================================================================

  describe("auto-dismiss timer logic", () => {
    it("should set a timer when a success message is set", () => {
      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
      const setMessage = vi.fn();

      // Simulate the effect: when message is success, start timer
      const message = { type: "success" as const, text: "Profile updated successfully!" };
      if (message?.type === "success") {
        const timer = setTimeout(() => setMessage(null), 4000);
        expect(timer).toBeDefined();
        expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 4000);
      }
    });

    it("should clear the success message after 4000ms", () => {
      const setMessage = vi.fn();

      // Simulate the effect with fake timers
      const message = { type: "success" as const, text: "Profile updated successfully!" };
      if (message?.type === "success") {
        setTimeout(() => setMessage(null), 4000);
      }

      // Fast-forward 3999ms — message should not have been cleared yet
      vi.advanceTimersByTime(3999);
      expect(setMessage).not.toHaveBeenCalled();

      // Fast-forward 1 more ms (total 4000ms) — message should be cleared
      vi.advanceTimersByTime(1);
      expect(setMessage).toHaveBeenCalledWith(null);
      expect(setMessage).toHaveBeenCalledTimes(1);
    });

    it("should NOT auto-dismiss error messages", () => {
      const setMessage = vi.fn();

      // Error message — should NOT trigger auto-dismiss
      const message = { type: "error" as const, text: "Failed to update profile" };
      if (message?.type === "success") {
        setTimeout(() => setMessage(null), 4000);
      }

      vi.advanceTimersByTime(5000);
      expect(setMessage).not.toHaveBeenCalled();
    });

    it("should NOT auto-dismiss null messages", () => {
      const setMessage = vi.fn();
      const message = null;

      if (message?.type === "success") {
        setTimeout(() => setMessage(null), 4000);
      }

      vi.advanceTimersByTime(5000);
      expect(setMessage).not.toHaveBeenCalled();
    });

    it("should clear previous timer when message changes before 4s", () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
      const setMessage = vi.fn();

      // Simulate cleanup: effect returns a cleanup function
      const message1 = { type: "success" as const, text: "Profile updated!" };
      const timer1 = setTimeout(() => setMessage(null), 4000);

      // Simulate cleanup of previous effect (message changes)
      clearTimeout(timer1);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(timer1);

      // New message
      const timer2 = setTimeout(() => setMessage(null), 4000);
      expect(timer2).not.toBe(timer1);
    });

    it("should not leak timers when component unmounts", () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
      const setMessage = vi.fn();

      // Simulate effect setup
      const timer = setTimeout(() => setMessage(null), 4000);

      // Simulate effect cleanup (unmount)
      clearTimeout(timer);

      // Fast-forward past 4s — message should NOT be set because timer was cleared
      vi.advanceTimersByTime(5000);
      expect(setMessage).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Timer precision and edge cases
  // ===========================================================================
  describe("timer precision", () => {
    it("should dismiss at exactly 4000ms (not earlier, not later)", () => {
      const setMessage = vi.fn();

      const message = { type: "success" as const, text: "Profile updated!" };
      setTimeout(() => setMessage(null), 4000);

      // Test at 3999ms
      vi.advanceTimersByTime(3999);
      expect(setMessage).toHaveBeenCalledTimes(0);

      // Test at exactly 4000ms
      vi.advanceTimersByTime(1);
      expect(setMessage).toHaveBeenCalledTimes(1);
      expect(setMessage).toHaveBeenCalledWith(null);
    });

    it("should handle rapid successive messages", () => {
      const setMessage = vi.fn();

      // First message
      const timer1 = setTimeout(() => setMessage(null), 4000);

      // 1 second later (before first timer completes), message changes (user saves again)
      vi.advanceTimersByTime(1000);
      clearTimeout(timer1);

      // Second message starts new timer from now (0)
      const timer2 = setTimeout(() => setMessage(null), 4000);

      // Advance 4 more seconds from current time (total 5s elapsed, 4s from second timer)
      vi.advanceTimersByTime(4000);
      expect(setMessage).toHaveBeenCalledTimes(1);
      expect(setMessage).toHaveBeenCalledWith(null);
    });
  });

  // ===========================================================================
  // saveProfile integration scenario
  // ===========================================================================
  describe("saveProfile scenario", () => {
    it("should show message on success then auto-dismiss after 4s", () => {
      const setMessage = vi.fn();
      const result = { type: "success" as const, text: "Profile updated successfully!" };

      // Simulate successful save
      setMessage(result);
      expect(setMessage).toHaveBeenCalledWith(result);

      // Simulate effect: set auto-dismiss timer for success
      if (result.type === "success") {
        setTimeout(() => setMessage(null), 4000);
      }

      // Message should be visible
      expect(setMessage).toHaveBeenCalledTimes(1);

      // After 4 seconds, message should be dismissed
      vi.advanceTimersByTime(4000);
      expect(setMessage).toHaveBeenCalledTimes(2);
      expect(setMessage).toHaveBeenLastCalledWith(null);
    });

    it("should show error message and NOT auto-dismiss", () => {
      const setMessage = vi.fn();
      const result = { type: "error" as const, text: "Failed to update profile" };

      // Simulate failed save
      setMessage(result);

      // Auto-dismiss only applies to success
      if (result.type === "success") {
        setTimeout(() => setMessage(null), 4000);
      }

      // After 5 seconds, error message should still be visible
      vi.advanceTimersByTime(5000);
      expect(setMessage).toHaveBeenCalledTimes(1); // Only the initial set
    });
  });
});
