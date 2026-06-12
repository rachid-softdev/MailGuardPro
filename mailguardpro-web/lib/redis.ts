import Redis from "ioredis";
import { CircuitBreaker } from "./circuitBreaker";
import { logger } from "./logger";
import { checkMemoryRateLimit } from "./rateLimitMemory";
import { safeJsonParse } from "./safeJson";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
  queueRedis: Redis | undefined;
  rateLimitRedis: Redis | undefined;
};

function createRedisClient(url: string, extraOpts: Record<string, unknown> = {}): Redis {
  const parsedUrl = new URL(url);

  if (parsedUrl.protocol !== "redis:" && parsedUrl.protocol !== "rediss:") {
    throw new Error(`Invalid REDIS_URL protocol: ${parsedUrl.protocol}. Use redis:// or rediss://`);
  }

  return new Redis({
    host: parsedUrl.hostname || "localhost",
    port: parseInt(parsedUrl.port) || 6379,
    username: parsedUrl.username || undefined,
    password: parsedUrl.password || undefined,
    tls: parsedUrl.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    connectTimeout: 5000,
    commandTimeout: 5000,
    retryStrategy: (times: number) => {
      if (times > 5) return null;
      return Math.min(times * 200, 2000);
    },
    ...extraOpts,
  });
}

const redisUrl =
  process.env.REDIS_URL ||
  (process.env.NODE_ENV === "production" ? undefined : "redis://localhost:6379");
if (!redisUrl) throw new Error("REDIS_URL is required in production");

// Warning if Redis doesn't use TLS in production
if (process.env.NODE_ENV === "production" && redisUrl.startsWith("redis://")) {
  logger.warn(
    "WARNING: REDIS_URL uses unencrypted redis:// protocol in production. Use rediss:// (TLS) for encrypted communication.",
  );
}

function silenceRedisErrors(client: Redis): void {
  client.on("error", () => {
    // Suppress unhandled error events when Redis is unavailable.
    // The circuit breaker and lazy connect pattern handle retries gracefully.
  });
}

export const redis = (() => {
  const client = globalForRedis.redis ?? createRedisClient(redisUrl);
  silenceRedisErrors(client);
  return client;
})();
export const queueRedis = (() => {
  const client =
    globalForRedis.queueRedis ?? createRedisClient(redisUrl, { maxRetriesPerRequest: null });
  silenceRedisErrors(client);
  return client;
})();
export const rateLimitRedis = (() => {
  const client = globalForRedis.rateLimitRedis ?? createRedisClient(redisUrl);
  silenceRedisErrors(client);
  return client;
})();

export const redisCircuitBreaker = new CircuitBreaker({
  name: "redis-rate-limit",
  failureThreshold: 5,
  timeoutMs: 15_000,
});

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
  globalForRedis.queueRedis = queueRedis;
  globalForRedis.rateLimitRedis = rateLimitRedis;
}

// Helper functions pour le cache
export async function getCached<T>(key: string): Promise<T | null> {
  const data = await redis.get(key);
  return data ? safeJsonParse<T>(data) : null;
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
    if ttl < 0 then
      redis.call("EXPIRE", key, window)
    end
  end
  local finalTtl = redis.call("TTL", key)
  if finalTtl < 0 then
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
  return redisCircuitBreaker.execute(
    async () => {
      const result = (await rateLimitRedis.eval(
        RATE_LIMIT_SCRIPT,
        1,
        `ratelimit:${key}`,
        limit.toString(),
        windowSeconds.toString(),
      )) as [number, number];

      const [current, ttl] = result;
      const resetAt = Date.now() + (ttl > 0 ? ttl * 1000 : windowSeconds * 1000);

      // Round to nearest 10 seconds to prevent precise timing leakage
      const roundedResetAt = Math.ceil(resetAt / 10000) * 10000;

      return {
        success: current <= limit,
        remaining: Math.max(0, limit - current),
        resetAt: roundedResetAt,
        limit,
      };
    },
    async () => {
      // Fail-closed: fallback to in-memory rate limiter with stricter limits
      logger.error("Rate limit check failed — falling back to memory rate limiter");
      return checkMemoryRateLimit(key, limit, windowSeconds);
    },
  );
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
      callback(safeJsonParse(message));
    } catch (err) {
      logger.warn({ err }, "Failed to parse progress message");
    }
  });

  return () => {
    subscriber.unsubscribe(`job:${jobId}:progress`);
    subscriber.disconnect();
  };
}

export default redis;
