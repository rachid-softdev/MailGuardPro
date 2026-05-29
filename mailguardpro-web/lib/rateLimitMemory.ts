// In-memory sliding-window rate limiter — fallback when Redis is unavailable
// Applies a 50% stricter limit to absorb burst traffic during failover.

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();

// Per-key locks to prevent race conditions under concurrent requests
const locks = new Map<string, Promise<void>>();

// Sweeper: clean expired entries every 60 seconds
const SWEEPER_INTERVAL_MS = 60_000;
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.windowStart >= SWEEPER_INTERVAL_MS) {
      store.delete(key);
    }
  }
}, SWEEPER_INTERVAL_MS);
sweeper.unref();

/**
 * Clear the sweeper interval — used in tests to prevent handle leaks.
 */
export function clearSweeper(): void {
  clearInterval(sweeper);
  store.clear();
  locks.clear();
}

export async function checkMemoryRateLimit(
  key: string,
  originalLimit: number,
  windowSeconds: number,
): Promise<{
  success: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  // Apply 50% stricter limit as a safety margin
  const limit = Math.max(1, Math.floor(originalLimit * 0.5));

  // Acquire per-key lock
  while (true) {
    const existing = locks.get(key);
    if (!existing) {
      locks.set(key, Promise.resolve());
      break;
    }
    try {
      await existing;
    } catch {
      // ignore
    }
  }
  try {
    const entry = store.get(key);

    // Round to nearest 10 seconds to prevent precise timing leakage
    const roundResetAt = (ts: number) => Math.ceil(ts / 10000) * 10000;

    if (!entry || now - entry.windowStart >= windowMs) {
      // New window
      store.set(key, { count: 1, windowStart: now });
      // LRU eviction if store exceeds max size
      if (store.size > 10_000) {
        const entriesToDelete = Math.floor(10_000 * 0.2);
        const keys = [...store.keys()].slice(0, entriesToDelete);
        for (const k of keys) store.delete(k);
        console.warn(`[RateLimit] Store exceeded limit, evicted ${entriesToDelete} entries`);
      }
      return {
        success: true,
        remaining: limit - 1,
        resetAt: roundResetAt(now + windowMs),
        limit,
      };
    }

    // Existing window — this is now safe from concurrent modification
    entry.count += 1;
    // LRU eviction if store exceeds max size
    if (store.size > 10_000) {
      const entriesToDelete = Math.floor(10_000 * 0.2);
      const keys = [...store.keys()].slice(0, entriesToDelete);
      for (const k of keys) store.delete(k);
      console.warn(`[RateLimit] Store exceeded limit, evicted ${entriesToDelete} entries`);
    }
    const success = entry.count <= limit;

    if (!success) {
      console.warn(
        "[RateLimit] REJECTED (memory fallback)",
        JSON.stringify({
          key,
          originalLimit,
          effectiveLimit: limit,
          windowSeconds,
          currentCount: entry.count,
          resetAt: new Date(entry.windowStart + windowMs).toISOString(),
          source: "memory",
        }),
      );
    }

    return {
      success,
      remaining: Math.max(0, limit - entry.count),
      resetAt: roundResetAt(entry.windowStart + windowMs),
      limit,
    };
  } finally {
    locks.delete(key);
  }
}
