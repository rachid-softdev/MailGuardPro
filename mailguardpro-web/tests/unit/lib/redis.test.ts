import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted to create mock before imports - mock ioredis to return our controlled instance
const { mockRedisInstance } = vi.hoisted(() => {
  const instance = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(60),
    publish: vi.fn().mockResolvedValue(1),
    duplicate: vi.fn(),
    disconnect: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    on: vi.fn(),
  }
  return { mockRedisInstance: instance }
})

// Mock ioredis to return our controlled instance
vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => mockRedisInstance),
}))

// Use importOriginal to get actual implementation but we need to mock the underlying redis instance
// The trick is to mock the module that redis.ts imports from
vi.mock('@/lib/redis', async () => {
  const actual = await vi.importActual('@/lib/redis')
  // Override the redis export to use our mock
  return {
    ...actual,
    redis: mockRedisInstance,
  }
})

// Import from the actual module - will use the mocked redis
import { redis, getCached, setCached, deleteCached, checkRateLimit, publishProgress, subscribeToProgress } from '@/lib/redis'

describe('redis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset all mock implementations
    mockRedisInstance.get.mockResolvedValue(null)
    mockRedisInstance.set.mockResolvedValue('OK')
    mockRedisInstance.setex.mockResolvedValue('OK')
    mockRedisInstance.del.mockResolvedValue(1)
    mockRedisInstance.incr.mockResolvedValue(1)
    mockRedisInstance.expire.mockResolvedValue(1)
    mockRedisInstance.publish.mockResolvedValue(1)
    mockRedisInstance.ttl.mockResolvedValue(60)
  })

  describe('redis connection', () => {
    it('should have redis client defined', () => {
      expect(redis).toBeDefined()
    })
  })

  describe('getCached', () => {
    it('should return null when no cached data exists', async () => {
      mockRedisInstance.get.mockResolvedValue(null)
      
      const result = await getCached('nonexistent-key')
      
      expect(result).toBeNull()
      expect(mockRedisInstance.get).toHaveBeenCalledWith('nonexistent-key')
    })

    it('should return parsed JSON when cached data exists', async () => {
      const cachedData = { test: 'value', count: 42 }
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(cachedData))
      
      const result = await getCached('test-key')
      
      expect(result).toEqual(cachedData)
    })

    it('should handle invalid JSON gracefully', async () => {
      mockRedisInstance.get.mockResolvedValue('invalid-json')
      
      await expect(getCached('bad-key')).rejects.toThrow()
    })
  })

  describe('setCached', () => {
    it('should set value with TTL', async () => {
      mockRedisInstance.setex.mockResolvedValue('OK')
      
      await setCached('test-key', { data: 'value' }, 3600)
      
      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        'test-key',
        3600,
        JSON.stringify({ data: 'value' })
      )
    })

    it('should use default TTL of 3600 seconds', async () => {
      mockRedisInstance.setex.mockResolvedValue('OK')
      
      await setCached('test-key', 'simple-value')
      
      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        'test-key',
        3600,
        '"simple-value"'
      )
    })
  })

  describe('deleteCached', () => {
    it('should delete key from cache', async () => {
      mockRedisInstance.del.mockResolvedValue(1)
      
      await deleteCached('test-key')
      
      expect(mockRedisInstance.del).toHaveBeenCalledWith('test-key')
    })

    it('should return void', async () => {
      mockRedisInstance.del.mockResolvedValue(1)
      
      const result = await deleteCached('test-key')
      
      expect(result).toBeUndefined()
    })
  })

  describe('checkRateLimit', () => {
    it('should allow request when under limit', async () => {
      mockRedisInstance.incr.mockResolvedValue(1)
      mockRedisInstance.expire.mockResolvedValue(1)
      mockRedisInstance.ttl.mockResolvedValue(60)
      
      const result = await checkRateLimit('test-key', 10, 60)
      
      expect(result.success).toBe(true)
      expect(result.remaining).toBe(9)
      expect(result.resetAt).toBeGreaterThan(Date.now())
    })

    it('should block request when over limit', async () => {
      mockRedisInstance.incr.mockResolvedValue(11)
      mockRedisInstance.expire.mockResolvedValue(1)
      mockRedisInstance.ttl.mockResolvedValue(60)
      
      const result = await checkRateLimit('test-key', 10, 60)
      
      expect(result.success).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('should return result object with all required properties', async () => {
      mockRedisInstance.incr.mockResolvedValue(5)
      mockRedisInstance.expire.mockResolvedValue(1)
      mockRedisInstance.ttl.mockResolvedValue(60)
      
      const result = await checkRateLimit('test-key', 10, 60)
      
      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('remaining')
      expect(result).toHaveProperty('resetAt')
    })

    it('should set expire on first request', async () => {
      mockRedisInstance.incr.mockResolvedValue(1)
      mockRedisInstance.expire.mockResolvedValue(1)
      mockRedisInstance.ttl.mockResolvedValue(60)
      
      await checkRateLimit('new-key', 10, 60)
      
      expect(mockRedisInstance.expire).toHaveBeenCalledWith('ratelimit:new-key', 60)
    })

    it('should not set expire on subsequent requests', async () => {
      mockRedisInstance.incr.mockResolvedValue(2)
      mockRedisInstance.ttl.mockResolvedValue(50)
      
      await checkRateLimit('existing-key', 10, 60)
      
      expect(mockRedisInstance.expire).not.toHaveBeenCalled()
    })

    it('should calculate resetAt based on TTL when available', async () => {
      mockRedisInstance.incr.mockResolvedValue(1)
      mockRedisInstance.expire.mockResolvedValue(1)
      mockRedisInstance.ttl.mockResolvedValue(30)
      
      const result = await checkRateLimit('test-key', 10, 60)
      
      // resetAt should be approximately now + 30 seconds
      expect(result.resetAt).toBeCloseTo(Date.now() + 30000, -2)
    })

    it('should use windowSeconds when TTL is not available', async () => {
      mockRedisInstance.incr.mockResolvedValue(1)
      mockRedisInstance.expire.mockResolvedValue(1)
      mockRedisInstance.ttl.mockResolvedValue(-1) // Key doesn't exist or no TTL
      
      const result = await checkRateLimit('test-key', 10, 60)
      
      // resetAt should be approximately now + 60 seconds (windowSeconds)
      expect(result.resetAt).toBeCloseTo(Date.now() + 60000, -2)
    })
  })

  describe('publishProgress', () => {
    it('should publish message to job channel', async () => {
      mockRedisInstance.publish.mockResolvedValue(1)
      
      await publishProgress('job-123', { progress: 50, status: 'processing' })
      
      expect(mockRedisInstance.publish).toHaveBeenCalledWith(
        'job:job-123:progress',
        JSON.stringify({ progress: 50, status: 'processing' })
      )
    })

    it('should publish without callback data', async () => {
      mockRedisInstance.publish.mockResolvedValue(1)
      
      await publishProgress('job-empty', null)
      
      expect(mockRedisInstance.publish).toHaveBeenCalled()
    })
  })

  describe('subscribeToProgress', () => {
    it('should return unsubscribe function', () => {
      const mockSubscriber = {
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        disconnect: vi.fn(),
        on: vi.fn(),
      }
      mockRedisInstance.duplicate.mockReturnValue(mockSubscriber as any)
      
      const unsubscribe = subscribeToProgress('job-123', vi.fn())
      
      expect(typeof unsubscribe).toBe('function')
    })

    it('should subscribe to the correct channel', () => {
      const mockSubscriber = {
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        disconnect: vi.fn(),
        on: vi.fn(),
      }
      mockRedisInstance.duplicate.mockReturnValue(mockSubscriber as any)
      
      subscribeToProgress('job-123', vi.fn())
      
      expect(mockSubscriber.subscribe).toHaveBeenCalledWith('job:job-123:progress')
    })

    it('should set up message handler', () => {
      const mockSubscriber = {
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        disconnect: vi.fn(),
        on: vi.fn(),
      }
      mockRedisInstance.duplicate.mockReturnValue(mockSubscriber as any)
      
      const callback = vi.fn()
      subscribeToProgress('job-123', callback)
      
      expect(mockSubscriber.on).toHaveBeenCalledWith('message', expect.any(Function))
    })

    it('should call unsubscribe and disconnect on cleanup', () => {
      const mockSubscriber = {
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        disconnect: vi.fn(),
        on: vi.fn(),
      }
      mockRedisInstance.duplicate.mockReturnValue(mockSubscriber as any)
      
      const unsubscribe = subscribeToProgress('job-123', vi.fn())
      unsubscribe()
      
      expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith('job:job-123:progress')
      expect(mockSubscriber.disconnect).toHaveBeenCalled()
    })
  })
})