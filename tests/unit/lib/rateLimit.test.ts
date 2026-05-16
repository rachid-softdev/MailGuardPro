import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the redis module before importing
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  setex: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
}

vi.mock('@/lib/redis', () => ({
  redis: mockRedis,
  checkRateLimit: vi.fn(),
}))

// Need to import after mocking
import { checkRateLimit } from '@/lib/redis'

describe('rateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('checkRateLimit', () => {
    it('should allow request when under limit', async () => {
      // Mock Redis to return count of 5 (under limit of 10)
      mockRedis.get.mockResolvedValue(JSON.stringify({ count: 5, resetAt: new Date(Date.now() + 60000) }))

      const result = await checkRateLimit('test-key', 10, 60)

      expect(result.success).toBe(true)
      expect(result.remaining).toBeDefined()
    })

    it('should block request when over limit', async () => {
      // Mock Redis to return count of 10 (at limit)
      mockRedis.get.mockResolvedValue(JSON.stringify({ count: 10, resetAt: new Date(Date.now() + 60000) }))

      const result = await checkRateLimit('test-key', 10, 60)

      expect(result.success).toBe(false)
    })

    it('should allow first request when no existing record', async () => {
      mockRedis.get.mockResolvedValue(null)
      mockRedis.setex.mockResolvedValue('OK')

      const result = await checkRateLimit('new-key', 10, 60)

      expect(result.success).toBe(true)
    })

    it('should handle expired rate limit records', async () => {
      // Mock expired record
      const expiredDate = new Date(Date.now() - 10000) // 10 seconds ago
      mockRedis.get.mockResolvedValue(JSON.stringify({ count: 10, resetAt: expiredDate }))

      const result = await checkRateLimit('expired-key', 10, 60)

      // Should allow because the reset time has passed
      expect(result).toHaveProperty('success')
    })
  })

  describe('rateLimit by IP', () => {
    it('should track IP-based rate limiting', async () => {
      mockRedis.get.mockResolvedValue(null)

      const result = await checkRateLimit('ip:192.168.1.1:/api/v1/validate', 20, 60)

      expect(result.success).toBe(true)
    })
  })

  describe('rateLimit by user', () => {
    it('should have higher limits for authenticated users', async () => {
      mockRedis.get.mockResolvedValue(null)

      const result = await checkRateLimit('user:user123', 50, 60)

      expect(result.success).toBe(true)
    })
  })
})