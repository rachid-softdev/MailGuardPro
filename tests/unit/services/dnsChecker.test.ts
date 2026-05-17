import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dns module
vi.mock('dns/promises', () => ({
  resolveMx: vi.fn(),
  resolveTxt: vi.fn(),
  resolve4: vi.fn(),
}))

import { checkMX, checkSPF, checkDMARC, getDomainInfo } from '@/services/dnsChecker'
import dns from 'dns/promises'

describe('checkMX', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should pass for domain with valid MX records', async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue([
      { priority: 10, exchange: 'smtp.gmail.com' },
      { priority: 20, exchange: 'alt1.gmail-smtp-in.l.google.com' },
    ])
    
    const result = await checkMX('test@gmail.com')
    
    expect(result.passed).toBe(true)
    expect(result.message).toContain('MX valide')
    expect(result.detail).toContain('smtp.gmail.com')
  })

  it('should fail for domain without MX records', async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue([])
    
    const result = await checkMX('test@no-mx-domain.com')
    
    expect(result.passed).toBe(false)
    expect(result.message).toContain('Aucun enregistrement MX')
  })

  it('should fail when DNS resolution fails', async () => {
    vi.mocked(dns.resolveMx).mockRejectedValue(new Error('ENOTFOUND'))
    
    const result = await checkMX('test@invalid.com')
    
    expect(result.passed).toBe(false)
    expect(result.message).toContain('Erreur de résolution')
  })

  it('should sort MX records by priority', async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue([
      { priority: 20, exchange: 'backup.example.com' },
      { priority: 10, exchange: 'primary.example.com' },
      { priority: 30, exchange: 'tertiary.example.com' },
    ])
    
    const result = await checkMX('test@example.com')
    
    expect(result.detail).toContain('primary.example.com')
    expect(result.detail).toContain('priorité: 10')
  })
})

describe('checkSPF', () => {
  it('should pass when SPF record is found', async () => {
    vi.mocked(dns.resolveTxt).mockResolvedValue([
      ['v=spf1 include:_spf.google.com ~all']
    ])
    
    const result = await checkSPF('gmail.com')
    
    expect(result.passed).toBe(true)
    expect(result.message).toContain('SPF configuré')
  })

  it('should fail when no SPF record is found', async () => {
    vi.mocked(dns.resolveTxt).mockResolvedValue([])
    
    const result = await checkSPF('no-spf-domain.com')
    
    expect(result.passed).toBe(false)
    expect(result.message).toContain('SPF non trouvé')
  })

  it('should handle DNS errors gracefully', async () => {
    vi.mocked(dns.resolveTxt).mockRejectedValue(new Error('DNS error'))
    
    const result = await checkSPF('error-domain.com')
    
    expect(result.passed).toBe(false)
    expect(result.message).toContain('Erreur vérification SPF')
  })

  it('should handle multiple TXT records', async () => {
    vi.mocked(dns.resolveTxt).mockResolvedValue([
      ['google-site-verification=abc123'],
      ['v=spf1 include:_spf.google.com ~all'],
    ])
    
    const result = await checkSPF('gmail.com')
    
    expect(result.passed).toBe(true)
  })
})

describe('checkDMARC', () => {
  it('should pass when DMARC record is found', async () => {
    vi.mocked(dns.resolveTxt).mockResolvedValue([
      ['v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com']
    ])
    
    const result = await checkDMARC('gmail.com')
    
    expect(result.passed).toBe(true)
    expect(result.message).toContain('DMARC configuré')
  })

  it('should fail when no DMARC record is found', async () => {
    vi.mocked(dns.resolveTxt).mockRejectedValue(new Error('NXDOMAIN'))
    
    const result = await checkDMARC('no-dmarc.com')
    
    expect(result.passed).toBe(false)
    expect(result.message).toContain('DMARC non trouvé')
  })
})

describe('getDomainInfo', () => {
  it('should return combined DNS info', async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue([
      { priority: 10, exchange: 'mx.example.com' }
    ])
    vi.mocked(dns.resolveTxt).mockResolvedValue([
      ['v=spf1 ~all']
    ])
    
    const result = await getDomainInfo('example.com')
    
    expect(result.mx).toContain('mx.example.com')
    expect(result.spf).toBe(true)
    expect(result.dmarc).toBe(false)
  })

  it('should handle errors gracefully', async () => {
    vi.mocked(dns.resolveMx).mockRejectedValue(new Error('DNS error'))
    vi.mocked(dns.resolveTxt).mockRejectedValue(new Error('DNS error'))
    
    const result = await getDomainInfo('error.com')
    
    expect(result.mx).toEqual([])
    expect(result.spf).toBe(false)
    expect(result.dmarc).toBe(false)
  })
})