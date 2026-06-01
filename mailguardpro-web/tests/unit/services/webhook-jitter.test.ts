// =============================================================================
// SEC-4: Webhook retry jitter
// Tests that withJitter() returns values within ±20% range, with randomness,
// and a minimum delay floor of 100ms.
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Import the functions to test
// NOTE: These are the proposed jitter enhancement functions
// that will be added to webhookDispatcher.ts as part of SEC-4.

/**
 * Apply jitter (±20%) to a delay value with a 100ms minimum floor.
 * This prevents thundering herd when multiple webhooks retry simultaneously.
 */
function withJitter(baseDelay: number): number {
  const jitter = baseDelay * 0.2; // ±20%
  const randomized = baseDelay + (Math.random() * jitter * 2 - jitter);
  return Math.max(100, Math.round(randomized));
}

/**
 * Generate retry delays with jitter for a given number of attempts.
 */
function generateRetryDelays(baseDelays: number[]): number[] {
  return baseDelays.map((delay) => withJitter(delay));
}

describe("SEC-4: Webhook retry jitter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --------------------------------------------------------------------------
  // withJitter — range validation
  // --------------------------------------------------------------------------

  describe("withJitter", () => {
    it("should return a value within ±20% of the base delay", () => {
      // Fix Math.random to test the extremes
      // Math.random() = 0 → jitter = -20% → delay * 0.8
      // Math.random() = 1 → jitter = +20% → delay * 1.2

      const testCases = [
        { base: 2000, min: 1600, max: 2400 },
        { base: 4000, min: 3200, max: 4800 },
        { base: 8000, min: 6400, max: 9600 },
        { base: 100, min: 100, max: 120 }, // floor at 100
        { base: 50, min: 100, max: 100 }, // floor at 100 (50*1.2=60, capped to 100)
      ];

      for (const { base, min, max } of testCases) {
        const result = withJitter(base);
        // Min should be at least 100 (floor)
        const expectedMin = Math.max(100, min);
        expect(result).toBeGreaterThanOrEqual(expectedMin);
        expect(result).toBeLessThanOrEqual(Math.max(expectedMin, max));
      }
    });

    it("should enforce a minimum floor of 100ms", () => {
      // For very small delays, floor should kick in
      const result = withJitter(10);
      expect(result).toBeGreaterThanOrEqual(100);

      const result2 = withJitter(50);
      expect(result2).toBeGreaterThanOrEqual(100);

      const result3 = withJitter(0);
      expect(result3).toBeGreaterThanOrEqual(100);
    });

    it("should produce different values on multiple calls (randomness)", () => {
      // Mock Math.random to return different values
      const randomValues = [0.1, 0.5, 0.9];
      let callCount = 0;
      const origRandom = Math.random;

      try {
        Math.random = vi.fn(() => {
          const val = randomValues[callCount % randomValues.length];
          callCount++;
          return val;
        });

        const results = new Set<number>();
        for (let i = 0; i < 20; i++) {
          results.add(withJitter(2000));
        }

        // With varying random values, we should get multiple distinct results
        expect(results.size).toBeGreaterThan(1);
      } finally {
        Math.random = origRandom;
      }
    });

    it("should work with the standard retry delays [2000, 4000, 8000]", () => {
      const delays = generateRetryDelays([2000, 4000, 8000]);

      expect(delays).toHaveLength(3);

      // Each delay should be within range
      for (let i = 0; i < delays.length; i++) {
        const base = [2000, 4000, 8000][i];
        expect(delays[i]).toBeGreaterThanOrEqual(Math.max(100, base * 0.8));
        expect(delays[i]).toBeLessThanOrEqual(base * 1.2);
      }
    });

    it("should return an integer value", () => {
      const result = withJitter(2000);
      expect(Number.isInteger(result)).toBe(true);
    });

    it("should handle Math.random = 0 (worst case min)", () => {
      const origRandom = Math.random;
      try {
        Math.random = vi.fn(() => 0);
        const result = withJitter(2000);
        // Math.random = 0 → jitter = -400 → result = max(100, 1600) = 1600
        expect(result).toBe(1600);
      } finally {
        Math.random = origRandom;
      }
    });

    it("should handle Math.random = 1 (worst case max)", () => {
      const origRandom = Math.random;
      try {
        Math.random = vi.fn(() => 1);
        const result = withJitter(2000);
        // Math.random = 1 → jitter = +400 → result = max(100, 2400) = 2400
        expect(result).toBe(2400);
      } finally {
        Math.random = origRandom;
      }
    });

    it("should floor correctly at 100ms even when jitter would go below", () => {
      const origRandom = Math.random;
      try {
        Math.random = vi.fn(() => 0);
        const result = withJitter(100);
        // Math.random = 0 → jitter = -20 → result = max(100, 80) = 100
        expect(result).toBe(100);
      } finally {
        Math.random = origRandom;
      }
    });
  });
});
