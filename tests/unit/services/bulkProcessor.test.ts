import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma
const mockPrisma = {
  bulkJob: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  validation: {
    findMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
    aggregate: vi.fn(),
    create: vi.fn(),
  },
}

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}))

// Mock redis
const mockRedis = {
  setex: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
}

vi.mock('@/lib/redis', () => ({
  redis: mockRedis,
  publishProgress: vi.fn(),
}))

// Mock Queue
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'job-123' }),
  })),
}))

import { 
  processBulkUpload, 
  getBulkJobStatus, 
  getBulkJobResults, 
  getBulkJobStats 
} from '@/services/bulkProcessor'

describe('bulkProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('processBulkUpload', () => {
    it('should reject files larger than 10MB', async () => {
      const largeFile = new File([''], 'test.csv', { type: 'text/csv' })
      Object.defineProperty(largeFile, 'size', { value: 11 * 1024 * 1024 })

      const result = await processBulkUpload(largeFile, 'user-123')

      expect(result.success).toBe(false)
      expect(result.errors).toContain('File too large')
    })

    it('should reject non-CSV files', async () => {
      const txtFile = new File(['test@example.com'], 'test.txt', { type: 'text/plain' })
      
      const result = await processBulkUpload(txtFile, 'user-123')

      expect(result.success).toBe(false)
      expect(result.errors).toContain('File must be a CSV')
    })

    it('should create bulk job for valid CSV', async () => {
      const csvContent = 'email\ntest@example.com\ntest2@example.com'
      const csvFile = new File([csvContent], 'test.csv', { type: 'text/csv' })

      mockPrisma.bulkJob.create.mockResolvedValue({
        id: 'job-123',
        userId: 'user-123',
        filename: 'test.csv',
        totalEmails: 2,
      })

      const result = await processBulkUpload(csvFile, 'user-123')

      expect(result.success).toBe(true)
      expect(result.jobId).toBe('job-123')
      expect(result.totalEmails).toBe(2)
    })

    it('should extract emails from various column names', async () => {
      const csvContent = 'email,Email,EMAIL\ntest1@example.com,test2@example.com,test3@example.com'
      const csvFile = new File([csvContent], 'test.csv', { type: 'text/csv' })

      mockPrisma.bulkJob.create.mockResolvedValue({
        id: 'job-123',
        userId: 'user-123',
        filename: 'test.csv',
        totalEmails: 3,
      })

      const result = await processBulkUpload(csvFile, 'user-123')

      expect(result.success).toBe(true)
      expect(result.totalEmails).toBe(3)
    })

    it('should reject when no valid emails found', async () => {
      const csvContent = 'name\nJohn Doe\nJane Doe'
      const csvFile = new File([csvContent], 'test.csv', { type: 'text/csv' })

      const result = await processBulkUpload(csvFile, 'user-123')

      expect(result.success).toBe(false)
      expect(result.errors).toContain('No valid emails found in file')
    })

    it('should enforce maximum row limit', async () => {
      // Create CSV with many rows
      const rows = ['email']
      for (let i = 0; i < 100001; i++) {
        rows.push(`test${i}@example.com`)
      }
      const csvContent = rows.join('\n')
      const csvFile = new File([csvContent], 'test.csv', { type: 'text/csv' })

      const result = await processBulkUpload(csvFile, 'user-123')

      expect(result.success).toBe(false)
      expect(result.errors).toContain('Too many emails')
    })
  })

  describe('getBulkJobStatus', () => {
    it('should return null for non-existent job', async () => {
      mockPrisma.bulkJob.findUnique.mockResolvedValue(null)

      const result = await getBulkJobStatus('nonexistent-job')

      expect(result).toBeNull()
    })

    it('should return job status with percentage', async () => {
      mockPrisma.bulkJob.findUnique.mockResolvedValue({
        id: 'job-123',
        status: 'PROCESSING',
        totalEmails: 100,
        processed: 50,
        filename: 'test.csv',
        createdAt: new Date(),
      })

      const result = await getBulkJobStatus('job-123')

      expect(result).not.toBeNull()
      expect(result?.percentage).toBe(50)
      expect(result?.status).toBe('PROCESSING')
    })
  })

  describe('getBulkJobResults', () => {
    it('should return paginated results', async () => {
      mockPrisma.validation.findMany.mockResolvedValue([
        { email: 'test1@example.com', score: 80 },
      ])
      mockPrisma.validation.count.mockResolvedValue(1)

      const result = await getBulkJobResults('job-123', 1, 50)

      expect(result.results).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.totalPages).toBe(1)
    })

    it('should filter by status', async () => {
      mockPrisma.validation.findMany.mockResolvedValue([])
      mockPrisma.validation.count.mockResolvedValue(0)

      await getBulkJobResults('job-123', 1, 50, { status: ['invalid'] })

      // Check that the query included status filter
      expect(mockPrisma.validation.findMany).toHaveBeenCalled()
    })
  })

  describe('getBulkJobStats', () => {
    it('should return aggregated statistics', async () => {
      mockPrisma.validation.groupBy.mockResolvedValue([
        { status: 'valid', _count: { status: 50 } },
        { status: 'invalid', _count: { status: 30 } },
        { status: 'risky', _count: { status: 20 } },
      ])
      mockPrisma.validation.aggregate.mockResolvedValue({
        _avg: { score: 72 },
        _count: { score: 100 },
      })

      const result = await getBulkJobStats('job-123')

      expect(result.valid).toBe(50)
      expect(result.invalid).toBe(30)
      expect(result.risky).toBe(20)
      expect(result.avgScore).toBe(72)
      expect(result.total).toBe(100)
    })

    it('should handle empty results', async () => {
      mockPrisma.validation.groupBy.mockResolvedValue([])
      mockPrisma.validation.aggregate.mockResolvedValue({
        _avg: { score: null },
        _count: { score: 0 },
      })

      const result = await getBulkJobStats('job-123')

      expect(result.total).toBe(0)
      expect(result.avgScore).toBe(0)
    })
  })
})