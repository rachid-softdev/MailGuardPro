import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dns module
vi.mock('dns/promises', () => ({
  resolve4: vi.fn(),
}))

import { checkDNSBL } from '@/services/dnsblChecker'
import dns from 'dns/promises'

describe('checkDNSBL', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should pass when IP is not blacklisted', async () => {
    // DNS query returns no results (NXDOMAIN = not listed)
    vi.mocked(dns.resolve4).mockRejectedValue(new Error('ENOTFOUND'))
    
    const result = await checkDNSBL('gmail.com')
    
    expect(result.passed).toBe(true)
    expect(result.message).toContain('Non blacklisté')
  })

  it('should fail when IP is blacklisted', async () => {
    // Return a listing address (127.0.0.x indicates listing)
    vi.mocked(dns.resolve4).mockResolvedValue(['127.0.0.2'])
    
    const result = await checkDNSBL('blacklisted-domain.com')
    
    expect(result.passed).toBe(false)
    expect(result.message).toContain('blacklistée')
  })

  it('should handle domains with no IP addresses', async () => {
    vi.mocked(dns.resolve4).mockResolvedValue([])
    
    const result = await checkDNSBL('no-ip-domain.com')
    
    expect(result.passed).toBe(true)
    expect(result.message).toContain('Aucune IP trouvée')
  })

  it('should handle DNS resolution errors', async () => {
    vi.mocked(dns.resolve4).mockRejectedValue(new Error('DNS error'))
    
    const result = await checkDNSBL('error-domain.com')
    
    // Should pass but mark as "verification impossible"
    expect(result.passed).toBe(true)
    expect(result.message).toContain('Vérification impossible')
  })

  it('should check all IPs against all DNSBLs', async () => {
    // First IP not listed, second IP blacklisted
    vi.mocked(dns.resolve4)
      .mockResolvedValueOnce(['1.2.3.4'])
      .mockRejectedValueOnce(new Error('ENOTFOUND')) // First IP clean
    // On second IP, return a blacklisted address
    vi.mocked(dns.resolve4).mockResolvedValue(['127.0.0.2'])
    
    const result = await checkDNSBL('multiple-ips.com')
    
    // Should detect the blacklist on second IP
    expect(result.passed).toBe(false)
  })
})