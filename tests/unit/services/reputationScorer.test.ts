import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock redis
vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn(),
    setex: vi.fn(),
  },
}))

import { getDomainReputation, getDomainAge } from '@/services/reputationScorer'

describe('reputationScorer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getDomainAge', () => {
    it('should return cached result if available', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ ageInDays: 365 }))
      
      const result = await getDomainAge('example.com')
      
      expect(result.ageInDays).toBe(365)
    })

    it('should return known old domain age for popular domains', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.get).mockResolvedValue(null)
      
      const result = await getDomainAge('google.com')
      
      expect(result.ageInDays).toBeGreaterThan(365 * 3) // Should be 5+ years
    })

    it('should return reasonable age for known TLDs', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.get).mockResolvedValue(null)
      
      // .com domains get default 3 years
      const result = await getDomainAge('random-domain.com')
      
      expect(result.ageInDays).toBe(365 * 3)
    })

    it('should return empty for unknown TLDs', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.get).mockResolvedValue(null)
      
      const result = await getDomainAge('random-domain.xyz')
      
      expect(result.ageInDays).toBeUndefined()
    })
  })

  describe('getDomainReputation', () => {
    it('should return good reputation for old known domains', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.get).mockResolvedValue(null)
      
      const result = await getDomainReputation('google.com')
      
      expect(result.reputation).toBe('good')
    })

    it('should return neutral for moderately old domains', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ ageInDays: 400 }))
      
      const result = await getDomainReputation('example.net')
      
      expect(result.reputation).toBe('neutral')
    })

    it('should return poor for very new domains', async () => {
      const { redis } = await import('@/lib/redis')
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ ageInDays: 15 }))
      
      const result = await getDomainReputation('new-domain.io')
      
      expect(result.reputation).toBe('poor')
    })

    it('should include domain name in result', async () => {
      const result = await getDomainReputation('test.com')
      
      expect(result.name).toBe('test.com')
    })
  })
})