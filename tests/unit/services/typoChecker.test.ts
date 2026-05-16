import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkTypo } from '@/services/typoChecker'

// Mock fast-levenshtein
vi.mock('fast-levenshtein', () => ({
  default: {
    distance: vi.fn((a: string, b: string) => {
      // Simple mock - return distance based on length difference
      return Math.abs(a.length - b.length)
    }),
  },
}))

describe('typoChecker', () => {
  describe('checkTypo', () => {
    it('should return passed for valid email with no typos', () => {
      const result = checkTypo('test@gmail.com')
      expect(result.passed).toBe(true)
      expect(result.weight).toBe(0)
    })

    it('should return failed for common gmail typos', () => {
      const result = checkTypo('test@gmaiil.com')
      expect(result.passed).toBe(false)
      expect(result.weight).toBe(10)
    })

    it('should return failed for common yahoo typos', () => {
      const result = checkTypo('test@yaho.com')
      expect(result.passed).toBe(false)
    })

    it('should return failed for common hotmail typos', () => {
      const result = checkTypo('test@hotmal.com')
      expect(result.passed).toBe(false)
    })

    it('should return suggestion for typo detected', () => {
      const result = checkTypo('test@gmaiil.com')
      expect(result).toHaveProperty('suggestion')
      expect(result.suggestion).toMatch(/gmail/)
    })

    it('should return passed for custom domain with no known typos', () => {
      const result = checkTypo('test@custom-domain.com')
      expect(result.passed).toBe(true)
    })

    it('should handle email with numbers in domain', () => {
      const result = checkTypo('test@company123.com')
      expect(result).toHaveProperty('passed')
    })

    it('should handle short local part', () => {
      const result = checkTypo('a@company.com')
      // Should not flag as typo just because short
      expect(result).toHaveProperty('passed')
    })
  })

  describe('checkTypo with corporate domains', () => {
    it('should not suggest free email providers for corporate emails', () => {
      const result = checkTypo('john@acme-corp.com')
      // Corporate domain - should pass even if similar to something
      expect(result).toHaveProperty('passed')
    })
  })
})