// =====================================================
// CACHE SERVICE - REDIS + MEMORY LRU FALLBACK
// =====================================================

import { redis, getCached, setCached, deleteCached } from '@/lib/redis'
import type { CachedEntitlements } from './types'

const CACHE_KEY_PREFIX = 'entitlements'
const CACHE_TTL_SECONDS = 300 // 5 minutes
const MEMORY_CACHE_TTL_MS = 30000 // 30 seconds

// =====================================================
// IN-MEMORY CACHE (LRU-style fallback)
// =====================================================

interface MemoryCacheEntry {
  data: CachedEntitlements
  expiresAt: number
}

class MemoryCache {
  private cache = new Map<string, MemoryCacheEntry>()
  private maxSize = 100

  get(key: string): CachedEntitlements | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    
    // Check expiry
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }
    
    // Move to end (LRU)
    this.cache.delete(key)
    this.cache.set(key, entry)
    
    return entry.data
  }

  set(key: string, data: CachedEntitlements, ttlMs: number = MEMORY_CACHE_TTL_MS): void {
    // Evict oldest if full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) this.cache.delete(firstKey)
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    })
  }

  delete(key: string): void {
    this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }
}

const memoryCache = new MemoryCache()

// =====================================================
// CACHE SERVICE
// =====================================================

export class EntitlementsCache {
  private redisAvailable = true

  constructor() {
    // Check Redis availability
    this.checkRedisAvailability()
  }

  private async checkRedisAvailability() {
    try {
      await redis.ping()
      this.redisAvailable = true
    } catch (error) {
      console.warn('[EntitlementsCache] Redis unavailable, using memory fallback')
      this.redisAvailable = false
    }
  }

  private getRedisKey(orgId: string): string {
    return `${CACHE_KEY_PREFIX}:${orgId}`
  }

  // =====================================================
  // GET ENTITLEMENTS
  // =====================================================

  async get(orgId: string): Promise<CachedEntitlements | null> {
    const memoryKey = `memory:${orgId}`

    // Try memory cache first (fastest)
    const memoryData = memoryCache.get(memoryKey)
    if (memoryData) {
      return memoryData
    }

    // Try Redis
    if (this.redisAvailable) {
      try {
        const redisKey = this.getRedisKey(orgId)
        const redisData = await getCached<CachedEntitlements>(redisKey)
        
        if (redisData) {
          // Store in memory for next time
          memoryCache.set(memoryKey, redisData)
          return redisData
        }
      } catch (error) {
        console.warn('[EntitlementsCache] Redis read error:', error)
      }
    }

    return null
  }

  // =====================================================
  // SET ENTITLEMENTS
  // =====================================================

  async set(orgId: string, data: CachedEntitlements): Promise<void> {
    const memoryKey = `memory:${orgId}`
    const redisKey = this.getRedisKey(orgId)

    // Always set memory cache
    memoryCache.set(memoryKey, data)

    // Try Redis
    if (this.redisAvailable) {
      try {
        await setCached(redisKey, data, CACHE_TTL_SECONDS)
      } catch (error) {
        console.warn('[EntitlementsCache] Redis write error:', error)
      }
    }
  }

  // =====================================================
  // INVALIDATE CACHE
  // =====================================================

  async invalidate(orgId: string): Promise<void> {
    const memoryKey = `memory:${orgId}`
    const redisKey = this.getRedisKey(orgId)

    // Clear memory
    memoryCache.delete(memoryKey)

    // Try Redis delete
    if (this.redisAvailable) {
      try {
        await deleteCached(redisKey)
      } catch (error) {
        console.warn('[EntitlementsCache] Redis delete error:', error)
      }
    }
  }

  // =====================================================
  // FAN-OUT INVALIDATION (multi-instance)
  // =====================================================

  async publishInvalidation(orgId: string): Promise<void> {
    if (!this.redisAvailable) {
      console.warn('[EntitlementsCache] Cannot publish - Redis unavailable')
      return
    }

    try {
      await redis.publish('entitlements:invalidate', JSON.stringify({ orgId }))
    } catch (error) {
      console.warn('[EntitlementsCache] Redis publish error:', error)
    }
  }

  // =====================================================
  // SUBSCRIBE TO INVALIDATIONS
  // =====================================================

  subscribeToInvalidations(callback: (orgId: string) => void): () => void {
    if (!this.redisAvailable) {
      console.warn('[EntitlementsCache] Cannot subscribe - Redis unavailable')
      return () => {}
    }

    const subscriber = redis.duplicate()
    subscriber.subscribe('entitlements:invalidate')

    subscriber.on('message', (_channel, message) => {
      try {
        const { orgId } = JSON.parse(message)
        // Clear local cache when other instances invalidate
        memoryCache.delete(`memory:${orgId}`)
        callback(orgId)
      } catch (error) {
        console.warn('[EntitlementsCache] Invalid message:', error)
      }
    })

    return () => {
      subscriber.unsubscribe('entitlements:invalidate')
      subscriber.disconnect()
    }
  }
}

// Export singleton
export const entitlementsCache = new EntitlementsCache()