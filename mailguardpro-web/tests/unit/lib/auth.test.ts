import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock next-auth
vi.mock('next-auth', () => ({
  __esModule: true,
  default: vi.fn(),
}))

vi.mock('next-auth/providers/google', () => ({
  __esModule: true,
  default: vi.fn(),
}))

vi.mock('next-auth/providers/resend', () => ({
  __esModule: true,
  default: vi.fn(),
}))

vi.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: vi.fn(),
}))

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { handlers, auth, signIn, signOut } from '@/lib/auth'

describe('auth', () => {
  describe('handlers', () => {
    it('should be defined', () => {
      expect(handlers).toBeDefined()
    })
  })

  describe('auth', () => {
    it('should be a function', () => {
      expect(typeof auth).toBe('function')
    })
  })

  describe('signIn', () => {
    it('should be a function', () => {
      expect(typeof signIn).toBe('function')
    })
  })

  describe('signOut', () => {
    it('should be a function', () => {
      expect(typeof signOut).toBe('function')
    })
  })
})