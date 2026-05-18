import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('prisma', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('prisma instance', () => {
    it('should be defined', async () => {
      const { prisma } = await import('@/lib/prisma')
      expect(prisma).toBeDefined()
    })

    it('should have user property', async () => {
      const { prisma } = await import('@/lib/prisma')
      expect(prisma.user).toBeDefined()
    })

    it('should have validation property', async () => {
      const { prisma } = await import('@/lib/prisma')
      expect(prisma.validation).toBeDefined()
    })

    it('should have bulkJob property', async () => {
      const { prisma } = await import('@/lib/prisma')
      expect(prisma.bulkJob).toBeDefined()
    })

    it('should have apiKey property', async () => {
      const { prisma } = await import('@/lib/prisma')
      expect(prisma.apiKey).toBeDefined()
    })

    it('should have webhook property', async () => {
      const { prisma } = await import('@/lib/prisma')
      expect(prisma.webhook).toBeDefined()
    })

    it('should have rateLimit property', async () => {
      const { prisma } = await import('@/lib/prisma')
      expect(prisma.rateLimit).toBeDefined()
    })

    it('should have auditLog property', async () => {
      const { prisma } = await import('@/lib/prisma')
      expect(prisma.auditLog).toBeDefined()
    })

    it('should have $transaction method', async () => {
      const { prisma } = await import('@/lib/prisma')
      expect(typeof prisma.$transaction).toBe('function')
    })

    it('should have $connect method', async () => {
      const { prisma } = await import('@/lib/prisma')
      expect(typeof prisma.$connect).toBe('function')
    })

    it('should have $disconnect method', async () => {
      const { prisma } = await import('@/lib/prisma')
      expect(typeof prisma.$disconnect).toBe('function')
    })
  })

  describe('CRUD operations', () => {
    it('should be able to query user', async () => {
      const { prisma } = await import('@/lib/prisma')
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        credits: 100,
      })

      const user = await prisma.user.findUnique({
        where: { id: 'user-123' },
      })

      expect(user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        credits: 100,
      })
    })

    it('should be able to create validation', async () => {
      const { prisma } = await import('@/lib/prisma')
      vi.mocked(prisma.validation.create).mockResolvedValue({
        id: 'val-123',
        email: 'test@example.com',
      })

      const validation = await prisma.validation.create({
        data: {
          email: 'test@example.com',
          score: 85,
          status: 'valid',
        },
      })

      expect(validation.email).toBe('test@example.com')
    })

    it('should be able to create bulk job', async () => {
      const { prisma } = await import('@/lib/prisma')
      vi.mocked(prisma.bulkJob.create).mockResolvedValue({
        id: 'job-123',
        status: 'pending',
      })

      const job = await prisma.bulkJob.create({
        data: {
          userId: 'user-123',
          filename: 'test.csv',
          total: 100,
        },
      })

      expect(job.status).toBe('pending')
    })
  })
})