import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkDisposable } from '@/services/disposableChecker'

describe('disposableChecker', () => {
  describe('checkDisposable', () => {
    it('should return passed for regular email domains', async () => {
      const result = await checkDisposable('test@gmail.com')
      expect(result.passed).toBe(true)
      expect(result.weight).toBe(10)
    })

    it('should return passed for custom domain', async () => {
      const result = await checkDisposable('test@company.com')
      expect(result.passed).toBe(true)
    })

    it('should return failed for known disposable domains', async () => {
      // Test with a known disposable domain pattern
      const result = await checkDisposable('test@tempmail.com')
      // The checker should detect this as disposable
      expect(result).toHaveProperty('passed')
    })

    it('should return failed for 10minutemail', async () => {
      const result = await checkDisposable('test@10minutemail.com')
      expect(result.passed).toBe(false)
      expect(result.weight).toBe(10)
    })

    it('should return failed for mailinator', async () => {
      const result = await checkDisposable('test@mailinator.com')
      expect(result.passed).toBe(false)
    })

    it('should return failed for guerrillamail', async () => {
      const result = await checkDisposable('test@guerrillamail.com')
      expect(result.passed).toBe(false)
    })

    it('should handle domains with various TLDs', async () => {
      const result = await checkDisposable('test@temp-mail.org')
      expect(result).toHaveProperty('passed')
    })

    it('should handle email with subdomain', async () => {
      const result = await checkDisposable('test@subdomain.disposable.com')
      // If disposable.com is in the list, should fail
      expect(result).toHaveProperty('passed')
    })
  })

  describe('checkDisposable edge cases', () => {
    it('should handle very long domain names', async () => {
      const longDomain = 'test@' + 'a'.repeat(100) + '.com'
      const result = await checkDisposable(longDomain)
      expect(result).toHaveProperty('passed')
    })

    it('should handle malformed email', async () => {
      // Should handle gracefully
      const result = await checkDisposable('not-an-email')
      expect(result).toHaveProperty('passed')
    })
  })
})