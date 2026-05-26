import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    connectTimeout: 3000,
    retryStrategy: (times: number) => {
      if (times > 5) return null;
      return Math.min(times * 200, 2000);
    },
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

// Helper functions pour le cache
export async function getCached<T>(key: string): Promise<T | null> {
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

export async function setCached(key: string, value: unknown, ttlSeconds = 3600): Promise<void> {
  await redis.setex(key, ttlSeconds, JSON.stringify(value));
}

export async function deleteCached(key: string): Promise<void> {
  await redis.del(key);
}

// Rate limiting helper
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{
  success: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}> {
  const current = await redis.incr(`ratelimit:${key}`);

  if (current === 1) {
    await redis.expire(`ratelimit:${key}`, windowSeconds);
  } else {
    // Defence-in-depth: re-set TTL if key lacks one (e.g., Redis crash between INCR and EXPIRE)
    try {
      const ttlCheck = await redis.ttl(`ratelimit:${key}`);
      if (ttlCheck === -1) {
        await redis.expire(`ratelimit:${key}`, windowSeconds);
      }
    } catch (err) {
      console.warn("[RateLimit] Failed to check/re-set TTL:", err);
    }
  }

  const ttl = await redis.ttl(`ratelimit:${key}`);
  const resetAt = Date.now() + (ttl > 0 ? ttl * 1000 : windowSeconds * 1000);

  return {
    success: current <= limit,
    remaining: Math.max(0, limit - current),
    resetAt,
    limit,
  };
}

// Pub/Sub for SSE
export async function publishProgress(jobId: string, data: unknown): Promise<void> {
  await redis.publish(`job:${jobId}:progress`, JSON.stringify(data));
}

export function subscribeToProgress(jobId: string, callback: (data: unknown) => void): () => void {
  const subscriber = redis.duplicate();

  subscriber.subscribe(`job:${jobId}:progress`);

  subscriber.on("message", (_channel, message) => {
    callback(JSON.parse(message));
  });

  return () => {
    subscriber.unsubscribe(`job:${jobId}:progress`);
    subscriber.disconnect();
  };
}

export default redis;
