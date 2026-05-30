// In-memory sliding-window rate limiter — fallback when Redis is unavailable
// Applies a 50% stricter limit to absorb burst traffic during failover.

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();

// Note: Node.js is single-threaded for JS execution, so Map operations on `store`
// are atomic. No explicit locks needed — there are no `await` points between
// the `get` and `set` calls that would allow interleaving.

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
}

const MAX_STORE_SIZE = 10_000;
const EVICT_PERCENT = 0.2;

/**
 * Evict oldest entries when store exceeds MAX_STORE_SIZE.
 * This is a memory safety valve, not a true LRU cache.
 * 10K entries ≈ ~2MB memory. Evict 20% to avoid frequent evictions.
 */
function evictIfNeeded(): void {
  if (store.size <= MAX_STORE_SIZE) return;
  const entriesToDelete = Math.floor(MAX_STORE_SIZE * EVICT_PERCENT);
  const keysToDelete = [...store.keys()].slice(0, entriesToDelete);
  for (const k of keysToDelete) store.delete(k);
  console.warn(`[RateLimit] Store exceeded limit, evicted ${entriesToDelete} entries`);
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

  const entry = store.get(key);

  // Round to nearest 10 seconds to prevent precise timing leakage
  const roundResetAt = (ts: number) => Math.ceil(ts / 10000) * 10000;

  if (!entry || now - entry.windowStart >= windowMs) {
    // New window
    store.set(key, { count: 1, windowStart: now });
    evictIfNeeded();
    return {
      success: true,
      remaining: limit - 1,
      resetAt: roundResetAt(now + windowMs),
      limit,
    };
  }

  // Existing window
  entry.count += 1;
  evictIfNeeded();
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
}
