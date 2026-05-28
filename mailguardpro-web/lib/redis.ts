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

// Lua script for atomic rate limiting
const RATE_LIMIT_SCRIPT = `
  local key = KEYS[1]
  local limit = tonumber(ARGV[1])
  local window = tonumber(ARGV[2])
  local current = redis.call("INCR", key)
  if current == 1 then
    redis.call("EXPIRE", key, window)
  else
    local ttl = redis.call("TTL", key)
    if ttl == -1 then
      redis.call("EXPIRE", key, window)
    end
  end
  local finalTtl = redis.call("TTL", key)
  if finalTtl == -1 then
    finalTtl = window
  end
  return {current, finalTtl}
`;

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
  const result = (await redis.eval(
    RATE_LIMIT_SCRIPT,
    1,
    `ratelimit:${key}`,
    limit.toString(),
    windowSeconds.toString(),
  )) as [number, number];

  const [current, ttl] = result;
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
    try {
      callback(JSON.parse(message));
    } catch (err) {
      console.warn("[Redis] Failed to parse progress message:", err);
    }
  });

  return () => {
    subscriber.unsubscribe(`job:${jobId}:progress`);
    subscriber.disconnect();
  };
}

export default redis;
