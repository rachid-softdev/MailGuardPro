import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted for proper mock hoisting
const { mockValidationFindMany } = vi.hoisted(() => ({
  mockValidationFindMany: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    validation: {
      findMany: mockValidationFindMany,
    },
    bulkJob: {
      findUnique: vi.fn().mockResolvedValue({ id: 'job-123', filename: 'test.csv' }),
    },
  },
}))

import { exportResults } from '@/services/exportService'

describe('exportService', () => {
  const mockValidationData = [
    {
      email: 'valid@example.com',
      score: 85,
      status: 'valid',
      checksJson: {
        format: { passed: true },
        mx: { passed: true },
        smtp: { passed: true },
        disposable: { passed: true },
        catchAll: { passed: true },
        generic: { passed: true },
        freeProvider: { passed: true },
        dnsbl: { passed: true },
        spf: { passed: true },
        dmarc: { passed: true },
        typo: { passed: true },
      },
      processingTimeMs: 150,
    },
    {
      email: 'invalid@example.com',
      score: 25,
      status: 'invalid',
      checksJson: {
        format: { passed: false },
        mx: { passed: false },
        smtp: { passed: false },
        disposable: { passed: true },
        catchAll: { passed: true },
        generic: { passed: false },
        freeProvider: { passed: true },
        dnsbl: { passed: true },
        spf: { passed: false },
        dmarc: { passed: false },
        typo: { passed: true, suggestion: 'correct@example.com' },
      },
      processingTimeMs: 200,
      checksJson: {
        domain: { reputation: 'good' },
      },
    },
    {
      email: 'risky@example.com',
      score: 55,
      status: 'risky',
      checksJson: {
        format: { passed: true },
        mx: { passed: true },
        smtp: { passed: false },
      },
      processingTimeMs: 180,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockValidationFindMany.mockResolvedValue(mockValidationData)
  })

  describe('exportResults', () => {
    it('should export CSV format', async () => {
      const result = await exportResults({
        jobId: 'test-job',
        format: 'csv',
      })
      expect(result).toBeDefined()
      expect(Buffer.isBuffer(result)).toBe(true)
      
      const content = result.toString()
      expect(content).toContain('email')
      expect(content).toContain('valid@example.com')
      expect(content).toContain('invalid@example.com')
    })

    it('should export CSV with all check columns', async () => {
      const result = await exportResults({
        jobId: 'test-job',
        format: 'csv',
      })
      
      const content = result.toString()
      expect(content).toContain('score')
      expect(content).toContain('status')
      expect(content).toContain('format_valid')
      expect(content).toContain('mx_valid')
      expect(content).toContain('smtp_valid')
    })

    it('should export JSON format with summary', async () => {
      const result = await exportResults({
        jobId: 'test-job',
        format: 'json',
      })
      expect(result).toBeDefined()
      expect(Buffer.isBuffer(result)).toBe(true)
      
      const content = result.toString()
      const parsed = JSON.parse(content)
      
      expect(parsed.meta).toBeDefined()
      expect(parsed.meta.jobId).toBe('test-job')
      expect(parsed.meta.exportedAt).toBeDefined()
      expect(parsed.meta.totalEmails).toBe(3)
      
      expect(parsed.summary).toBeDefined()
      expect(parsed.summary.valid).toBe(1)
      expect(parsed.summary.invalid).toBe(1)
      expect(parsed.summary.risky).toBe(1)
      expect(parsed.summary.unknown).toBe(0)
      expect(parsed.summary.avgScore).toBe(55) // (85+25+55)/3 = 55
    })

    it('should export JSON with empty results when no data', async () => {
      mockValidationFindMany.mockResolvedValueOnce([])
      
      const result = await exportResults({
        jobId: 'test-job',
        format: 'json',
      })
      
      const content = result.toString()
      const parsed = JSON.parse(content)
      
      expect(parsed.summary.valid).toBe(0)
      expect(parsed.summary.avgScore).toBe(0)
    })

    it('should export XLSX format with multiple sheets', async () => {
      const result = await exportResults({
        jobId: 'test-job',
        format: 'xlsx',
      })
      expect(result).toBeDefined()
      expect(Buffer.isBuffer(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    })

    it('should include check results in export', async () => {
      const result = await exportResults({
        jobId: 'test-job',
        format: 'csv',
      })
      
      const content = result.toString()
      // Should include various check results
      expect(content).toContain('disposable')
      expect(content).toContain('catchall')
    })

    it('should apply status filters', async () => {
      await exportResults({
        jobId: 'test-job',
        format: 'csv',
        filters: { status: ['valid'] },
      })
      
      expect(mockValidationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            bulkJobId: 'test-job',
            status: { in: ['valid'] },
          }),
        })
      )
    })

    it('should apply score filters', async () => {
      await exportResults({
        jobId: 'test-job',
        format: 'csv',
        filters: { minScore: 50, maxScore: 80 },
      })
      
      expect(mockValidationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            bulkJobId: 'test-job',
            score: expect.objectContaining({
              gte: 50,
              lte: 80,
            }),
          }),
        })
      )
    })

    it('should throw for PDF format', async () => {
      await expect(
        exportResults({
          jobId: 'test-job',
          format: 'pdf',
        })
      ).rejects.toThrow('PDF is generated client-side')
    })

    it('should throw for unsupported format', async () => {
      await expect(
        exportResults({
          jobId: 'test-job',
          format: 'invalid' as any,
        })
      ).rejects.toThrow('Unsupported format')
    })

    it('should sort results by score descending', async () => {
      await exportResults({
        jobId: 'test-job',
        format: 'csv',
      })
      
      expect(mockValidationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { score: 'desc' },
        })
      )
    })

    it('should include suggestion from typo check', async () => {
      const result = await exportResults({
        jobId: 'test-job',
        format: 'csv',
      })
      
      const content = result.toString()
      expect(content).toContain('suggestion')
    })

    it('should handle missing optional fields gracefully', async () => {
      mockValidationFindMany.mockResolvedValueOnce([
        {
          email: 'minimal@example.com',
          score: 50,
          status: 'unknown',
          checksJson: {},
          processingTimeMs: null,
        },
      ])
      
      const result = await exportResults({
        jobId: 'test-job',
        format: 'csv',
      })
      
      expect(result).toBeDefined()
      const content = result.toString()
      expect(content).toContain('minimal@example.com')
    })

    it('should include domain reputation when available', async () => {
      const result = await exportResults({
        jobId: 'test-job',
        format: 'csv',
      })
      
      const content = result.toString()
      expect(content).toContain('domain_reputation')
    })
  })
})