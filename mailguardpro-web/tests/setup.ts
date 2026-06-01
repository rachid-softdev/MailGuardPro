// Test setup global pour Vitest

import { afterAll, afterEach, beforeAll, vi } from "vitest";

// ==========================================
// BUFFER MOCK (needed by crypto)
// ==========================================
vi.mock("buffer", () => ({
  __esModule: true,
  default: {
    Buffer: {
      from: vi.fn((str) => str),
      isBuffer: vi.fn(() => false),
    },
  },
  Buffer: {
    from: vi.fn((str) => str),
    isBuffer: vi.fn(() => false),
  },
}));

// ==========================================
// CRYPTO MOCK - Must return actual mock functions, not vi.fn()
// ==========================================
const createHmacMock = () => ({
  update: vi.fn().mockReturnThis(),
  digest: vi.fn(() => Buffer.from("mock-signature")),
});

const createHashMock = () => ({
  update: vi.fn().mockReturnThis(),
  digest: vi.fn(() => Buffer.from("mock-hash")),
});

vi.mock("crypto", () => {
  const createHmac = vi.fn(createHmacMock);
  const createHash = vi.fn(createHashMock);
  const timingSafeEqual = vi.fn(() => true);
  const randomUUID = vi.fn(() => `test-${Date.now()}`);
  const randomBytes = vi.fn((size: number) => Buffer.alloc(size, "a"));

  return {
    __esModule: true,
    default: {
      randomUUID,
      createHmac,
      timingSafeEqual,
      createHash,
      randomBytes,
    },
    randomUUID,
    createHmac,
    timingSafeEqual,
    createHash,
    randomBytes,
  };
});

// Set global crypto
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: {
      randomUUID: () => `test-${Date.now()}`,
      createHmac: createHmacMock(),
      timingSafeEqual: () => true,
      createHash: createHashMock(),
    },
    writable: true,
  });
}

// ==========================================
// DNS/PROMISES MOCK - Must have proper mock functions for vi.mocked()
// ==========================================
const createDnsPromisesMock = () => ({
  resolveMx: vi.fn().mockResolvedValue([]),
  resolveTxt: vi.fn().mockResolvedValue([]),
  resolve: vi.fn().mockResolvedValue([]),
  resolveCname: vi.fn().mockResolvedValue([]),
  reverse: vi.fn().mockResolvedValue([]),
});

vi.mock("dns/promises", () => {
  const mocks = createDnsPromisesMock();
  return {
    __esModule: true,
    default: mocks,
    ...mocks,
  };
});

// ==========================================
// DNS MOCK (non-promises)
// ==========================================
vi.mock("dns", () => ({
  __esModule: true,
  default: {
    resolve: vi.fn((_hostname, _rrtype, callback) => callback(null, [])),
    resolveMx: vi.fn((_hostname, callback) => callback(null, [])),
    resolveTxt: vi.fn((_hostname, callback) => callback(null, [])),
    setServers: vi.fn(),
  },
  resolve: vi.fn((_hostname, _rrtype, callback) => callback(null, [])),
  resolveMx: vi.fn((_hostname, callback) => callback(null, [])),
  resolveTxt: vi.fn((_hostname, callback) => callback(null, [])),
  setServers: vi.fn(),
}));

// ==========================================
// FAST-LEVENSHTEIN MOCK - Must return function as default export
// The code uses: const mod = await import('fast-levenshtein'); levenshtein = mod.default
// So default must be a function
// ==========================================
const distanceFn = vi.fn((a: string, b: string): number => {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  let diff = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) diff++;
  }
  diff += Math.abs(a.length - b.length);
  return diff;
});

vi.mock("fast-levenshtein", () => ({
  __esModule: true,
  default: distanceFn,
  get: distanceFn,
  getEditDistance: distanceFn,
}));

// ==========================================
// NET MODULE MOCK (for SMTP)
// ==========================================
vi.mock("net", () => ({
  __esModule: true,
  default: {
    createConnection: vi.fn(() => ({
      connect: vi.fn(),
      setEncoding: vi.fn(),
      on: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
      write: vi.fn(),
    })),
  },
  createConnection: vi.fn(() => ({
    connect: vi.fn(),
    setEncoding: vi.fn(),
    on: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn(),
    write: vi.fn(),
  })),
}));

// ==========================================
// CONSOLE MOCK
// ==========================================
const originalConsole = { ...console };
beforeAll(() => {
  // Silence console in tests
});

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  Object.assign(console, originalConsole);
});

// ==========================================
// PRISMA MOCK
// ==========================================
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    validation: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    bulkJob: {
      create: vi.fn().mockResolvedValue({ id: "mock-job-id" }),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    apiKey: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    webhook: {
      create: vi.fn().mockResolvedValue({ id: "mock-webhook-id" }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    rateLimit: {
      upsert: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn((cb) => cb(vi.mocked({}))),
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

// ==========================================
// REDIS MOCK (must include all exports from lib/redis.ts)
// ==========================================
const redisMockInstance = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue("OK"),
  setex: vi.fn().mockResolvedValue("OK"),
  del: vi.fn().mockResolvedValue(1),
  incr: vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
  publish: vi.fn().mockResolvedValue(1),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  keys: vi.fn().mockResolvedValue([]),
  ttl: vi.fn().mockResolvedValue(60),
  eval: vi.fn().mockResolvedValue([1, 60]),
  duplicate: vi.fn(() => ({
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
  })),
  on: vi.fn(),
  quit: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/lib/redis", () => ({
  redis: redisMockInstance,
  queueRedis: redisMockInstance,
  rateLimitRedis: redisMockInstance,
  checkRateLimit: vi.fn(() =>
    Promise.resolve({
      success: true,
      resetAt: Date.now() + 60000,
      remaining: 100,
      limit: 100,
    }),
  ),
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  deleteCached: vi.fn().mockResolvedValue(undefined),
  publishProgress: vi.fn().mockResolvedValue(undefined),
  subscribeToProgress: vi.fn(() => vi.fn()),
}));

// ==========================================
// NEXTAUTH MOCK
// ==========================================
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(null)),
  handlers: { GET: vi.fn(), POST: vi.fn() },
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

// ==========================================
// SENTRY MOCK
// ==========================================
vi.mock("@sentry/nextjs", () => ({
  __esModule: true,
  default: {
    init: vi.fn(),
    captureMessage: vi.fn(),
    captureException: vi.fn(),
    setUser: vi.fn(),
    addBreadcrumb: vi.fn(),
  },
  init: vi.fn(),
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  setUser: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

// ==========================================
// PINO LOGGER MOCK
// ==========================================
const createMockLogger = () => ({
  child: vi.fn((bindings) => ({
    ...createMockLogger(),
    bindings: bindings || {},
  })),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  bindings: {},
});

vi.mock("pino", () => ({
  __esModule: true,
  default: vi.fn(() => createMockLogger()),
}));

// ==========================================
// STRIPE MOCK (must be constructable with new Stripe())
// ==========================================
class MockStripe {
  constructor() {
    this.customers = { create: vi.fn() };
    this.subscriptions = { create: vi.fn() };
    this.checkout = { sessions: { create: vi.fn() } };
  }
}

vi.mock("stripe", () => ({
  __esModule: true,
  default: MockStripe,
}));

// ==========================================
// RESEND MOCK (must be constructable with new Resend())
// ==========================================
class MockResend {
  constructor() {
    this.emails = { send: vi.fn().mockResolvedValue({ id: "email-123" }) };
  }
}

vi.mock("resend", () => ({
  __esModule: true,
  Resend: MockResend,
}));

export {};
