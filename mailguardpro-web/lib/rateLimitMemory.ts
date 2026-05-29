// In-memory sliding-window rate limiter — fallback when Redis is unavailable
// Applies a 50% stricter limit to absorb burst traffic during failover.

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();

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

  if (!entry || now - entry.windowStart >= windowMs) {
    // New window
    store.set(key, { count: 1, windowStart: now });
    return {
      success: true,
      remaining: limit - 1,
      resetAt: now + windowMs,
      limit,
    };
  }

  // Existing window
  entry.count += 1;
  const success = entry.count <= limit;

  return {
    success,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.windowStart + windowMs,
    limit,
  };
}
