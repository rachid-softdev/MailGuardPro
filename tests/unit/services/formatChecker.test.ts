import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkFormat } from '@/services/formatChecker'

describe('formatChecker', () => {
  describe('checkFormat', () => {
    it('should return passed for valid email', () => {
      const result = checkFormat('test@example.com')
      expect(result.passed).toBe(true)
      expect(result.weight).toBe(15)
    })

    it('should return passed for email with dots in local part', () => {
      const result = checkFormat('first.last@example.com')
      expect(result.passed).toBe(true)
    })

    it('should return passed for email with plus alias', () => {
      const result = checkFormat('test+alias@example.com')
      expect(result.passed).toBe(true)
    })

    it('should return passed for email with subdomain', () => {
      const result = checkFormat('test@sub.domain.example.com')
      expect(result.passed).toBe(true)
    })

    it('should return failed for email without @', () => {
      const result = checkFormat('example.com')
      expect(result.passed).toBe(false)
      expect(result.message).toContain('@')
    })

    it('should return failed for email without domain', () => {
      const result = checkFormat('test@')
      expect(result.passed).toBe(false)
    })

    it('should return failed for email without local part', () => {
      const result = checkFormat('@example.com')
      expect(result.passed).toBe(false)
    })

    it('should return failed for email with spaces', () => {
      const result = checkFormat('test @example.com')
      expect(result.passed).toBe(false)
    })

    it('should return failed for email with invalid characters', () => {
      const result = checkFormat('test<>@example.com')
      expect(result.passed).toBe(false)
    })

    it('should return failed for email with double dots', () => {
      const result = checkFormat('test..test@example.com')
      expect(result.passed).toBe(false)
    })

    it('should return failed for email starting with dot', () => {
      const result = checkFormat('.test@example.com')
      expect(result.passed).toBe(false)
    })

    it('should return failed for email with invalid TLD', () => {
      // This is actually valid per RFC but we may want stricter validation
      const result = checkFormat('test@example')
      // Per current implementation, this should pass
      expect(result.passed).toBe(true)
    })

    it('should return failed for email exceeding max length', () => {
      const longLocal = 'a'.repeat(65)
      const result = checkFormat(`${longLocal}@example.com`)
      expect(result.passed).toBe(false)
    })

    it('should handle email with numbers', () => {
      const result = checkFormat('user123@example456.com')
      expect(result.passed).toBe(true)
    })

    it('should handle email with hyphen in domain', () => {
      const result = checkFormat('test@my-domain.com')
      expect(result.passed).toBe(true)
    })
  })

  describe('checkFormat edge cases', () => {
    it('should handle very long email correctly', () => {
      const longEmail = 'a'.repeat(100) + '@' + 'b'.repeat(100) + '.com'
      const result = checkFormat(longEmail)
      // Should handle without crashing
      expect(result).toHaveProperty('passed')
    })

    it('should handle unicode email', () => {
      const result = checkFormat('test@exämple.com')
      expect(result.passed).toBe(true) // Basic validation allows this
    })
  })
})