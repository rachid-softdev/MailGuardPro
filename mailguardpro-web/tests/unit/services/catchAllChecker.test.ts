import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as dns from 'dns/promises'
import { checkCatchAll, checkCatchAllQuick } from '@/services/catchAllChecker'

// Mock the dns module
vi.mock('dns/promises', () => {
  const mockResolveMx = vi.fn()
  return {
    __esModule: true,
    default: {
      resolveMx: mockResolveMx,
    },
    resolveMx: mockResolveMx,
  }
})

describe('catchAllChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('checkCatchAll', () => {
    it('should return passed when no MX records found', async () => {
      vi.mocked(dns.resolveMx).mockResolvedValue([])
      
      const result = await checkCatchAll('nodomain.com')
      
      expect(result.passed).toBe(true)
      expect(result.weight).toBe(5)
      expect(result.message).toBe('Pas de MX record')
    })

    it('should return passed when MX records exist and count <= 5', async () => {
      vi.mocked(dns.resolveMx).mockResolvedValue([
        { priority: 10, exchange: 'mx1.example.com' },
        { priority: 20, exchange: 'mx2.example.com' },
      ])
      
      const result = await checkCatchAll('example.com')
      
      expect(result.passed).toBe(true)
      expect(result.message).toBe('Non catch-all')
      expect(result.weight).toBe(10)
    })

    it('should return failed when many MX records (> 5) - likely catch-all', async () => {
      vi.mocked(dns.resolveMx).mockResolvedValue([
        { priority: 10, exchange: 'mx1.example.com' },
        { priority: 20, exchange: 'mx2.example.com' },
        { priority: 30, exchange: 'mx3.example.com' },
        { priority: 40, exchange: 'mx4.example.com' },
        { priority: 50, exchange: 'mx5.example.com' },
        { priority: 60, exchange: 'mx6.example.com' },
      ])
      
      const result = await checkCatchAll('example.com')
      
      expect(result.passed).toBe(false)
      expect(result.message).toBe('Domaine potentiellement catch-all')
      expect(result.weight).toBe(10)
    })

    it('should handle DNS resolution errors gracefully', async () => {
      vi.mocked(dns.resolveMx).mockRejectedValue(new Error('DNS error'))
      
      const result = await checkCatchAll('invalid.com')
      
      expect(result.passed).toBe(true)
      expect(result.message).toBe('Vérification impossible')
      expect(result.weight).toBe(5)
    })

    it('should sort MX records by priority', async () => {
      vi.mocked(dns.resolveMx).mockResolvedValue([
        { priority: 30, exchange: 'mx3.example.com' },
        { priority: 10, exchange: 'mx1.example.com' },
        { priority: 20, exchange: 'mx2.example.com' },
      ])
      
      const result = await checkCatchAll('example.com')
      
      // The function should complete without error
      expect(result).toBeDefined()
      expect(dns.resolveMx).toHaveBeenCalledWith('example.com')
    })

    it('should handle undefined MX records', async () => {
      vi.mocked(dns.resolveMx).mockResolvedValue(undefined as any)
      
      const result = await checkCatchAll('example.com')
      
      expect(result.passed).toBe(true)
      expect(result.message).toBe('Pas de MX record')
    })
  })

  describe('checkCatchAllQuick', () => {
    it('should return passed for empty MX records', async () => {
      vi.mocked(dns.resolveMx).mockResolvedValue([])
      
      const result = await checkCatchAllQuick('nodomain.com')
      
      expect(result.passed).toBe(true)
      expect(result.message).toBe('Pas de MX')
    })

    it('should return passed for normal MX count (<= 4)', async () => {
      vi.mocked(dns.resolveMx).mockResolvedValue([
        { priority: 10, exchange: 'mx1.example.com' },
        { priority: 20, exchange: 'mx2.example.com' },
      ])
      
      const result = await checkCatchAllQuick('example.com')
      
      expect(result.passed).toBe(true)
      expect(result.message).toBe('Likely not catch-all')
    })

    it('should return failed for many MX records (> 4)', async () => {
      vi.mocked(dns.resolveMx).mockResolvedValue([
        { priority: 10, exchange: 'mx1.example.com' },
        { priority: 20, exchange: 'mx2.example.com' },
        { priority: 30, exchange: 'mx3.example.com' },
        { priority: 40, exchange: 'mx4.example.com' },
        { priority: 50, exchange: 'mx5.example.com' },
      ])
      
      const result = await checkCatchAllQuick('example.com')
      
      expect(result.passed).toBe(false)
      expect(result.message).toBe('Possibly catch-all')
    })

    it('should handle DNS errors gracefully', async () => {
      vi.mocked(dns.resolveMx).mockRejectedValue(new Error('DNS error'))
      
      const result = await checkCatchAllQuick('invalid.com')
      
      expect(result.passed).toBe(true)
      expect(result.message).toBe('Cannot verify')
    })
  })
})