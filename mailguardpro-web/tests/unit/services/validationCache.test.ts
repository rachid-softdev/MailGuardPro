import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getCachedValidation,
  setCachedValidation,
  invalidateValidationCache,
  getCachedDomainChecks,
  setCachedDomainChecks,
  getRecentValidationCount,
  incrementRecentValidation,
  clearAllValidationCaches,
} from '@/services/validationCache'

describe('validationCache', () => {
  const mockValidationResult = {
    email: 'test@example.com',
    score: 85,
    status: 'valid' as const,
    checks: {},
    domain: {},
    processingTimeMs: 100,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getCachedValidation', () => {
    it('should return null when cache is empty', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.get).mockResolvedValue(null)

      const result = await getCachedValidation('test@example.com')

      expect(result).toBeNull()
      expect(redis.get).toHaveBeenCalledWith('validation:test@example.com')
    })

    it('should return cached validation result', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify(mockValidationResult))

      const result = await getCachedValidation('test@example.com')

      expect(result).toEqual(mockValidationResult)
    })

    it('should handle JSON parse errors gracefully', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.get).mockResolvedValue('invalid-json')

      const result = await getCachedValidation('test@example.com')

      expect(result).toBeNull()
    })

    it('should handle Redis errors gracefully', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.get).mockRejectedValue(new Error('Redis error'))

      const result = await getCachedValidation('test@example.com')

      expect(result).toBeNull()
    })

    it('should normalize email to lowercase', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.get).mockResolvedValue(null)

      await getCachedValidation('Test@Example.COM')

      expect(redis.get).toHaveBeenCalledWith('validation:test@example.com')
    })
  })

  describe('setCachedValidation', () => {
    it('should set validation result in cache', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.setex).mockResolvedValue('OK')

      await setCachedValidation('test@example.com', mockValidationResult)

      expect(redis.setex).toHaveBeenCalledWith(
        'validation:test@example.com',
        86400,
        JSON.stringify(mockValidationResult)
      )
    })

    it('should handle Redis errors gracefully', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.setex).mockRejectedValue(new Error('Redis error'))

      // Should not throw
      await expect(setCachedValidation('test@example.com', mockValidationResult)).resolves.not.toThrow()
    })
  })

  describe('invalidateValidationCache', () => {
    it('should delete cached validation', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.del).mockResolvedValue(1)

      await invalidateValidationCache('test@example.com')

      expect(redis.del).toHaveBeenCalledWith('validation:test@example.com')
    })

    it('should handle Redis errors gracefully', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.del).mockRejectedValue(new Error('Redis error'))

      await expect(invalidateValidationCache('test@example.com')).resolves.not.toThrow()
    })
  })

  describe('getCachedDomainChecks', () => {
    it('should return null when no cached domain checks', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.get).mockResolvedValue(null)

      const result = await getCachedDomainChecks('example.com')

      expect(result).toBeNull()
    })

    it('should return cached domain checks', async () => {
      const { redis } = await import('@/lib/redis')
      const domainChecks = { mx: { passed: true }, spf: { passed: true } }
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify(domainChecks))

      const result = await getCachedDomainChecks('example.com')

      expect(result).toEqual(domainChecks)
    })
  })

  describe('setCachedDomainChecks', () => {
    it('should set domain checks in cache', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.setex).mockResolvedValue('OK')

      const domainChecks = { mx: { passed: true }, spf: { passed: true } }
      await setCachedDomainChecks('example.com', domainChecks)

      expect(redis.setex).toHaveBeenCalledWith(
        'domain-checks:example.com',
        7200,
        JSON.stringify(domainChecks)
      )
    })
  })

  describe('getRecentValidationCount', () => {
    it('should return 0 when no recent validations', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.get).mockResolvedValue(null)

      const result = await getRecentValidationCount('test@example.com')

      expect(result).toBe(0)
    })

    it('should return count of recent validations', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.get).mockResolvedValue('5')

      const result = await getRecentValidationCount('test@example.com')

      expect(result).toBe(5)
    })

    it('should handle parse errors', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.get).mockResolvedValue('invalid')

      const result = await getRecentValidationCount('test@example.com')

      // parseInt('invalid', 10) returns NaN
      expect(result).toBeNaN()
    })
  })

  describe('incrementRecentValidation', () => {
    it('should increment and set expiry on first count', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.incr).mockResolvedValue(1)
      vi.mocked(redis.expire).mockResolvedValue(1)

      await incrementRecentValidation('test@example.com')

      expect(redis.incr).toHaveBeenCalledWith('recent-validation:test@example.com')
      expect(redis.expire).toHaveBeenCalledWith('recent-validation:test@example.com', 3600)
    })

    it('should not set expiry on subsequent increments', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.incr).mockResolvedValue(5)

      await incrementRecentValidation('test@example.com')

      expect(redis.expire).not.toHaveBeenCalled()
    })
  })

  describe('clearAllValidationCaches', () => {
    it('should clear all validation caches and return count', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.keys)
        .mockResolvedValueOnce(['validation:test1', 'validation:test2'])
        .mockResolvedValueOnce(['domain-checks:example1'])
        .mockResolvedValueOnce(['recent-validation:test'])
      vi.mocked(redis.del).mockResolvedValue(4)

      const result = await clearAllValidationCaches()

      expect(result).toBe(4)
    })

    it('should handle empty caches', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.keys).mockResolvedValue([])

      const result = await clearAllValidationCaches()

      expect(result).toBe(0)
    })

    it('should handle Redis errors and return partial count', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.keys)
        .mockResolvedValueOnce(['validation:test1'])
        .mockRejectedValueOnce(new Error('Error'))
      vi.mocked(redis.del).mockResolvedValue(1)

      const result = await clearAllValidationCaches()

      expect(result).toBe(1)
    })
  })
})