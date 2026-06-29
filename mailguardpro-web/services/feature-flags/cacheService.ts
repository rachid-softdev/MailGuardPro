// ================================================================
// CacheService — Two-Level Cache (Redis + Memory LRU)
// ================================================================
// Level 1 : Redis (TTL 5 min)    → key: `entitlements:{orgId}`
// Level 2 : Memory LRU (TTL 30s) → fallback if Redis absent
//
// Invalidation:
//   - Automatic on mutation (plan change, override CRUD)
//   - Manual via invalidateCache(orgId)
//   - Via Redis pub/sub for multi-instances (pattern fan-out)
// ================================================================

import { logger } from "@/lib/logger";

// ---- Minimal LRU Cache (no external deps) ----
// O(1) get/set, TTL-based expiry, max entries limit.

interface LRUEntry<T> {
  value: T;
  expiresAt: number;
}

export class LRUCache<T> {
  private map = new Map<string, LRUEntry<T>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize = 1000, ttlMs = 30_000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    // LRU: move to end (most recently used)
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    // Evict if over max size
    if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest) this.map.delete(oldest);
    }
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  del(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

// ---- Redis Pub/Sub Channel ----

const CACHE_CHANNEL = "entitlements:invalidate";
const REDIS_TTL = 300; // 5 minutes
const MEMORY_TTL = 30_000; // 30 seconds

// ---- Cache Service Interface ----

export interface ICacheService {
  get(orgId: string): Promise<Record<string, unknown> | null>;
  set(orgId: string, data: Record<string, unknown>): Promise<void>;
  invalidate(orgId: string): Promise<void>;
  invalidateAll(): Promise<void>;
}

// ---- Cache Service Implementation ----

interface RedisClient {
  get(key: string): Promise<string | null>;
  setex(key: string, ttl: number, value: string): Promise<unknown>;
  del(key: string): Promise<number>;
  publish(channel: string, message: string): Promise<number>;
  subscribe(...channels: string[]): Promise<number>;
  on(event: string, callback: (...args: any[]) => void): void;
}

function createNoopRedis(): RedisClient {
  return {
    async get() {
      return null;
    },
    async setex() {
      return null;
    },
    async del() {
      return 0;
    },
    async publish() {
      return 0;
    },
    async subscribe() {
      return 0;
    },
    on() {},
  };
}

export class CacheService implements ICacheService {
  private readonly memoryCache: LRUCache<Record<string, unknown>>;
  private readonly redis: RedisClient;
  private readonly redisAvailable: boolean;
  private subscribed = false;
  private subscribeCleanup: (() => void) | null = null;

  constructor(redis?: RedisClient) {
    this.memoryCache = new LRUCache<Record<string, unknown>>(1000, MEMORY_TTL);
    this.redis = redis ?? createNoopRedis();
    this.redisAvailable = redis !== undefined;
    this.setupSubscription();
  }

  private setupSubscription(): void {
    if (!this.redisAvailable || this.subscribed) return;
    try {
      this.redis
        .subscribe(CACHE_CHANNEL)
        .then(() => {
          this.subscribed = true;
          logger.info("CacheService: subscribed to Redis pub/sub for multi-instance invalidation");
        })
        .catch((err) => {
          logger.warn(
            { err },
            "CacheService: Redis pub/sub unavailable — multi-instance cache may be stale",
          );
        });
      this.redis.on("message", (_channel: string, message: string) => {
        try {
          const { orgId } = JSON.parse(message);
          if (orgId) {
            this.memoryCache.del(this.memKey(orgId));
          }
        } catch {
          // ignore malformed messages
        }
      });
    } catch (err) {
      logger.warn(
        { err },
        "CacheService: Redis pub/sub unavailable — multi-instance cache may be stale",
      );
    }
  }

  private memKey(orgId: string): string {
    return `entitlements:${orgId}`;
  }

  private redisKey(orgId: string): string {
    return `entitlements:${orgId}`;
  }

  async get(orgId: string): Promise<Record<string, unknown> | null> {
    // Level 1: Redis
    if (this.redisAvailable) {
      try {
        const raw = await this.redis.get(this.redisKey(orgId));
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          // Also populate memory cache for fast local reads
          this.memoryCache.set(this.memKey(orgId), parsed);
          return parsed;
        }
      } catch (err) {
        logger.warn({ err, orgId }, "CacheService: Redis read failed, falling back to memory");
      }
    }

    // Level 2: Memory LRU (fallback if Redis absent or failed)
    const memResult = this.memoryCache.get(this.memKey(orgId));
    if (memResult) {
      logger.debug({ orgId }, "CacheService: memory cache hit");
    }
    return memResult ?? null;
  }

  async set(orgId: string, data: Record<string, unknown>): Promise<void> {
    // Always write to memory
    this.memoryCache.set(this.memKey(orgId), data);

    // Write to Redis
    if (this.redisAvailable) {
      try {
        await this.redis.setex(this.redisKey(orgId), REDIS_TTL, JSON.stringify(data));
      } catch (err) {
        logger.warn({ err, orgId }, "CacheService: Redis write failed");
      }
    }
  }

  async invalidate(orgId: string): Promise<void> {
    // Invalidate memory
    this.memoryCache.del(this.memKey(orgId));

    // Invalidate Redis
    if (this.redisAvailable) {
      try {
        await this.redis.del(this.redisKey(orgId));
        // Publish to other instances
        await this.redis.publish(CACHE_CHANNEL, JSON.stringify({ orgId, timestamp: Date.now() }));
      } catch (err) {
        logger.warn({ err, orgId }, "CacheService: Redis invalidation failed");
      }
    }
  }

  async invalidateAll(): Promise<void> {
    this.memoryCache.clear();
    // Note: Redis wildcard deletion would need SCAN + DEL pattern
    logger.info("CacheService: all memory cache cleared");
  }

  /** Cleanup subscription on shutdown */
  destroy(): void {
    this.subscribeCleanup?.();
    this.subscribed = false;
  }
}

// ---- Singleton for production use ----

let cacheServiceInstance: CacheService | null = null;

export function getCacheService(redis?: RedisClient): CacheService {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new CacheService(redis);
  }
  return cacheServiceInstance;
}

export function resetCacheService(): void {
  if (cacheServiceInstance) {
    cacheServiceInstance.destroy();
    cacheServiceInstance = null;
  }
}
