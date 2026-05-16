// Test setup global pour Vitest

import { beforeAll, afterAll, afterEach, vi } from 'vitest'

// Mock global pour l'environnement Node
globalThis.crypto = globalThis.crypto || {
  randomUUID: () => `${Date.now()}-${Math.random().toString(36).slice(2)}`,
} as Crypto

// Mock console pour les tests (optionnel - supprimer les logs)
const originalConsole = { ...console }
beforeAll(() => {
  // console.debug = vi.fn()
  // console.info = vi.fn()
})

afterEach(() => {
  vi.clearAllMocks()
})

afterAll(() => {
  // Restore console
  Object.assign(console, originalConsole)
})

// Mock Prisma pour les tests
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    validation: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    bulkJob: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    apiKey: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
    webhook: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    rateLimit: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn(prisma)),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  },
}))

// Mock Redis
vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    publish: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
  checkRateLimit: vi.fn(() => Promise.resolve({ success: true, resetAt: new Date() })),
}))

// Mock NextAuth
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(() => Promise.resolve(null)),
}))

// Mock services
vi.mock('dns/promises', () => ({
  resolveMx: vi.fn(),
  resolveTxt: vi.fn(),
  resolve: vi.fn(),
}))

export {}