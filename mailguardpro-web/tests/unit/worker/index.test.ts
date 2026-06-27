/**
 * Comprehensive unit tests for worker/index.ts
 *
 * Tests the BullMQ worker's processor function, event handlers,
 * and graceful shutdown behavior.
 *
 * Coverage areas:
 *   - Processor: happy path, batch flushing, resume, error handling,
 *     progress tracking, status updates, webhook dispatch
 *   - Events: completed, failed (with/without job, final vs non-final), error
 *   - Shutdown: SIGTERM, SIGINT handlers
 *   - Edge cases: null bulkJob, missing emailsJson, flush failure,
 *     webhook failure, empty email list, all-processed resume
 *
 * Mock approach: capture the processor and event/process handlers by
 * intercepting the Worker constructor and process.on at module load time.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted helpers — run before all imports
// ---------------------------------------------------------------------------

// Prisma mocks
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockValidationCreate = vi.hoisted(() => vi.fn());
const mockValidationCreateMany = vi.hoisted(() => vi.fn());

// Service mocks
const mockValidateEmail = vi.hoisted(() => vi.fn());
const mockPublish = vi.hoisted(() => vi.fn());
const mockDispatchToUser = vi.hoisted(() => vi.fn());

// Logger mocks
const mockLoggerWorkerInfo = vi.hoisted(() => vi.fn());
const mockLoggerWorkerError = vi.hoisted(() => vi.fn());

// Redis mock: we need to expose the quit mock for shutdown tests
const mockRedisQuit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

// Worker instance mock
const mockClose = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

// State captured at module load time
let capturedProcessor: ((job: any) => Promise<any>) | null = null;
const capturedEventHandlers: Record<string, (...args: any[]) => void> = {};
const capturedProcessHandlers: Record<string, (...args: any[]) => void> = {};

// Worker constructor arguments
let capturedWorkerName: string = "";
let capturedWorkerOptions: any = null;

const mockWorkerCtor = vi.hoisted(
  () =>
    function MockWorker(name: string, processor: (job: any) => Promise<any>, options?: any) {
      capturedProcessor = processor;
      capturedWorkerName = name;
      capturedWorkerOptions = options;
      return {
        on: (event: string, handler: (...args: any[]) => void) => {
          capturedEventHandlers[event] = handler;
        },
        close: mockClose,
      };
    },
);

// ---------------------------------------------------------------------------
// Module mocks (hoisted by vitest)
// ---------------------------------------------------------------------------

vi.mock("bullmq", () => ({
  Worker: mockWorkerCtor,
  Job: vi.fn(),
}));

vi.mock("ioredis", () => {
  const redisInstance = {
    publish: mockPublish,
    quit: mockRedisQuit,
    on: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    duplicate: vi.fn(),
  };
  const Redis = function () {
    return redisInstance;
  };
  return { default: Redis };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bulkJob: {
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
    validation: {
      create: mockValidationCreate,
      createMany: vi.fn((args: { data: any[] }) => {
        // Deep-copy data to avoid mutation issues: the source code reuses
        // the same buffer array (buffer.length = 0 + push), which mutates
        // the reference stored in vitest's mock call history.
        return mockValidationCreateMany({
          data: args.data.map((item: any) => ({ ...item })),
        });
      }),
    },
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  },
}));

vi.mock("@/services/emailValidator", () => ({
  validateEmail: mockValidateEmail,
}));

vi.mock("@/services/webhookDispatcher", () => ({
  WebhookDispatcher: {
    dispatchToUser: mockDispatchToUser,
  },
  WEBHOOK_EVENTS: { BULK_JOB_COMPLETED: "bulk_job_completed" },
  createBulkJobCompletedPayload: vi.fn((jobId: string, totalEmails: number, results: any) => ({
    jobId,
    totalEmails,
    results,
  })),
}));

vi.mock("@/lib/emailHash", () => ({
  maskEmail: vi.fn((email: string) => {
    const [local, domain] = email.split("@");
    return `${local.charAt(0)}***@${domain}`;
  }),
  hashEmail: vi.fn((email: string) => `hashed:${email.toLowerCase().trim()}`),
}));

vi.mock("@/lib/logger", () => ({
  loggerWorker: {
    info: mockLoggerWorkerInfo,
    error: mockLoggerWorkerError,
    child: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  },
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  },
  loggerWebhook: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  loggerAuth: { info: vi.fn(), error: vi.fn() },
  loggerApi: { info: vi.fn(), error: vi.fn() },
  loggerValidation: { info: vi.fn(), error: vi.fn() },
  loggerDb: { info: vi.fn(), error: vi.fn() },
  loggerStripe: { info: vi.fn(), error: vi.fn() },
  logRequest: vi.fn(),
  logError: vi.fn(),
  logMetrics: vi.fn(),
  createRequestLogger: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockJob(overrides: Record<string, any> = {}): any {
  return {
    id: "job-123",
    data: {
      jobId: "job-123",
      totalEmails: 10,
      userId: "user-123",
      requestId: "req-123",
      ...overrides,
    },
    updateProgress: vi.fn(),
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides,
  };
}

function makeEmail(index: number, email?: string) {
  return {
    email: email ?? `test${index}@example.com`,
    firstName: `First${index}`,
    lastName: `Last${index}`,
    company: `Company${index}`,
  };
}

function makeValidationResult(
  email: string,
  score: number,
  status: "valid" | "invalid" | "risky" | "unknown",
) {
  return {
    email,
    score,
    status,
    checks: { format: { passed: true } },
    processingTimeMs: 50,
  };
}

/**
 * Load the worker module fresh, capturing the processor function,
 * event handlers, and process signal handlers.
 */
async function loadWorkerModule(): Promise<void> {
  capturedProcessor = null;
  capturedWorkerName = "";
  capturedWorkerOptions = null;
  Object.keys(capturedEventHandlers).forEach((k) => delete capturedEventHandlers[k]);
  Object.keys(capturedProcessHandlers).forEach((k) => delete capturedProcessHandlers[k]);

  vi.resetModules();
  await import("@/worker/index");
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Default mock implementations
  mockValidateEmail.mockImplementation((email: string) =>
    Promise.resolve(makeValidationResult(email, 85, "valid")),
  );
  mockUpdate.mockResolvedValue({});
  mockValidationCreate.mockResolvedValue({});
  mockValidationCreateMany.mockResolvedValue({ count: 50 });
  mockPublish.mockResolvedValue(1);
  mockDispatchToUser.mockResolvedValue({
    total: 0,
    successful: 0,
    failed: 0,
  });

  // Spy on process events to capture SIGTERM/SIGINT handlers
  vi.spyOn(process, "on").mockImplementation(((
    event: string,
    handler: (...args: any[]) => void,
  ) => {
    capturedProcessHandlers[event] = handler;
    return process;
  }) as any);
  vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

  // Silence stray console output
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// PROCESSOR TESTS
// ===========================================================================

describe("Worker processor", () => {
  // ─── Happy path ─────────────────────────────────────────────────────────

  it("should process all emails from bulkJob.emailsJson", async () => {
    const emails = [makeEmail(0, "alice@test.com"), makeEmail(1, "bob@test.com")];
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });

    await loadWorkerModule();
    const result = await capturedProcessor!(createMockJob());

    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-123" },
        select: { emailsJson: true, processed: true },
      }),
    );
    expect(mockValidateEmail).toHaveBeenCalledTimes(2);
    expect(mockValidateEmail).toHaveBeenCalledWith("alice@test.com");
    expect(mockValidateEmail).toHaveBeenCalledWith("bob@test.com");
    expect(result).toEqual({
      processed: 10,
      results: { valid: 2, invalid: 0, risky: 0, unknown: 0 },
    });
  });

  it("should create validation records via createMany", async () => {
    const emails = [makeEmail(0, "alice@test.com")];
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });

    await loadWorkerModule();
    await capturedProcessor!(createMockJob({ totalEmails: 1 }));

    expect(mockValidationCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            email: "a***@test.com",
            emailHash: "hashed:alice@test.com",
            score: 85,
            status: "valid",
            userId: "user-123",
            bulkJobId: "job-123",
            processingTimeMs: 50,
          }),
        ]),
      }),
    );
  });

  // ─── Batch flushing ─────────────────────────────────────────────────────

  it("should flush buffer every 50 emails (2 batches for 55 emails)", async () => {
    const emails = Array.from({ length: 55 }, (_, i) => makeEmail(i));
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });

    await loadWorkerModule();
    await capturedProcessor!(createMockJob({ totalEmails: 55 }));

    // First batch of 50 + remaining 5 = 2 calls
    expect(mockValidationCreateMany).toHaveBeenCalledTimes(2);
    // Each call creates the right number of records
    const calls = mockValidationCreateMany.mock.calls;
    expect(calls[0][0].data).toHaveLength(50);
    expect(calls[1][0].data).toHaveLength(5);
  });

  it("should flush remaining buffer at end (< 50 items)", async () => {
    const emails = Array.from({ length: 7 }, (_, i) => makeEmail(i));
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });

    await loadWorkerModule();
    await capturedProcessor!(createMockJob({ totalEmails: 7 }));

    // Only final flush should happen
    expect(mockValidationCreateMany).toHaveBeenCalledTimes(1);
    expect(mockValidationCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.arrayContaining([expect.any(Object)]) }),
    );
  });

  it("should not flush when buffer is empty at end", async () => {
    const emails: any[] = [];
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });

    await loadWorkerModule();
    await capturedProcessor!(createMockJob({ totalEmails: 0 }));

    // No createMany calls expected since buffer is empty
    expect(mockValidationCreateMany).not.toHaveBeenCalled();
  });

  it("should throw when batch flush fails", async () => {
    const emails = Array.from({ length: 55 }, (_, i) => makeEmail(i));
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });
    mockValidationCreateMany.mockRejectedValueOnce(new Error("DB write failed"));

    await loadWorkerModule();
    await expect(capturedProcessor!(createMockJob({ totalEmails: 55 }))).rejects.toThrow(
      "DB write failed",
    );

    // Second call (for remaining buffer) should not happen
    expect(mockValidationCreateMany).toHaveBeenCalledTimes(1);
    expect(mockLoggerWorkerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), jobId: "job-123" }),
      expect.stringContaining("Batch flush failed"),
    );
  });

  it("should throw when final flush fails (< BATCH_SIZE items)", async () => {
    const emails = Array.from({ length: 7 }, (_, i) => makeEmail(i));
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });
    // Only 7 emails < 50, so only final flush. Make it fail.
    mockValidationCreateMany.mockRejectedValueOnce(new Error("Final flush error"));

    await loadWorkerModule();
    await expect(capturedProcessor!(createMockJob({ totalEmails: 7 }))).rejects.toThrow(
      "Final flush error",
    );

    expect(mockValidationCreateMany).toHaveBeenCalledTimes(1);
    expect(mockLoggerWorkerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), jobId: "job-123" }),
      expect.stringContaining("Final flush failed"),
    );
  });

  // ─── Resume support ─────────────────────────────────────────────────────

  it("should skip already-processed emails when processed > 0", async () => {
    const emails = [
      makeEmail(0, "skip0@test.com"),
      makeEmail(1, "skip1@test.com"),
      makeEmail(2, "keep2@test.com"),
      makeEmail(3, "keep3@test.com"),
    ];
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 2 });

    await loadWorkerModule();
    const result = await capturedProcessor!(createMockJob());

    expect(mockValidateEmail).not.toHaveBeenCalledWith("skip0@test.com");
    expect(mockValidateEmail).not.toHaveBeenCalledWith("skip1@test.com");
    expect(mockValidateEmail).toHaveBeenCalledWith("keep2@test.com");
    expect(mockValidateEmail).toHaveBeenCalledWith("keep3@test.com");
    expect(mockValidateEmail).toHaveBeenCalledTimes(2);

    // Results count only the emails processed this run
    expect(result.results).toEqual({
      valid: 2,
      invalid: 0,
      risky: 0,
      unknown: 0,
    });
    // processed in return is totalEmails (not what was processed this run)
    expect(result.processed).toBe(10);
  });

  it("should start from beginning when processed === 0", async () => {
    const emails = [makeEmail(0, "first@test.com"), makeEmail(1, "second@test.com")];
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });

    await loadWorkerModule();
    await capturedProcessor!(createMockJob());

    expect(mockValidateEmail).toHaveBeenCalledTimes(2);
    expect(mockValidateEmail).toHaveBeenCalledWith("first@test.com");
    expect(mockValidateEmail).toHaveBeenCalledWith("second@test.com");
  });

  it("should handle processed = totalEmails (all already done)", async () => {
    const emails = Array.from({ length: 10 }, (_, i) => makeEmail(i));
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 10 });

    await loadWorkerModule();
    await capturedProcessor!(createMockJob({ totalEmails: 10 }));

    expect(mockValidateEmail).not.toHaveBeenCalled();
    expect(mockValidationCreateMany).not.toHaveBeenCalled();
  });

  it("should process all remaining emails after partial resume", async () => {
    const emails = Array.from({ length: 10 }, (_, i) => makeEmail(i));
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 7 });

    await loadWorkerModule();
    await capturedProcessor!(createMockJob({ totalEmails: 10 }));

    expect(mockValidateEmail).toHaveBeenCalledTimes(3);
    expect(mockValidateEmail).toHaveBeenCalledWith("test7@example.com");
    expect(mockValidateEmail).toHaveBeenCalledWith("test8@example.com");
    expect(mockValidateEmail).toHaveBeenCalledWith("test9@example.com");
  });

  // ─── Status updates ─────────────────────────────────────────────────────

  it("should set job status to PROCESSING at start", async () => {
    const emails = [makeEmail(0, "a@test.com")];
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });

    await loadWorkerModule();
    await capturedProcessor!(createMockJob({ totalEmails: 1 }));

    // First update must be PROCESSING with a startedAt date
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-123" },
        data: expect.objectContaining({
          status: "PROCESSING",
          startedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("should set job status to COMPLETED at end", async () => {
    const emails = [makeEmail(0, "a@test.com")];
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });

    await loadWorkerModule();
    await capturedProcessor!(createMockJob({ totalEmails: 1 }));

    // Last update must be COMPLETED with processed = totalEmails
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-123" },
        data: expect.objectContaining({
          status: "COMPLETED",
          processed: 1,
          completedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("should update to PROCESSING before reading emails from DB", async () => {
    const emails = [makeEmail(0, "a@test.com")];
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });

    await loadWorkerModule();
    await capturedProcessor!(createMockJob({ totalEmails: 1 }));

    // First call to mockUpdate should be PROCESSING
    const updateCalls = mockUpdate.mock.calls;
    expect(updateCalls[0][0].data.status).toBe("PROCESSING");
    expect(updateCalls[updateCalls.length - 1][0].data.status).toBe("COMPLETED");
  });

  // ─── Progress tracking ─────────────────────────────────────────────────

  it("should update processed count every 10 emails", async () => {
    const emails = Array.from({ length: 12 }, (_, i) => makeEmail(i));
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });

    await loadWorkerModule();
    await capturedProcessor!(createMockJob({ totalEmails: 12 }));

    // Should have an update with processed=10 (the 10th email), and processed=12 (final)
    const updateCalls = mockUpdate.mock.calls.filter(
      (call: any) => call[0].data.processed !== undefined,
    );
    // The updates with processed are: PROCESSING (no processed), progress=10, COMPLETED (processed=12)
    // We need to find the progress update
    expect(updateCalls.some((call: any) => call[0].data.processed === 10)).toBe(true);
  });

  it("should publish progress via Redis pub/sub every 10 emails", async () => {
    const emails = Array.from({ length: 15 }, (_, i) => makeEmail(i));
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });

    await loadWorkerModule();
    await capturedProcessor!(createMockJob({ totalEmails: 15 }));

    // Should publish for processed=10 (index 9 triggers it)
    expect(mockPublish).toHaveBeenCalledWith(
      "job:job-123:progress",
      expect.stringContaining('"processed":10'),
    );
    // Should publish for processed=15 (final update) no — only for %10 !== 0 check
    // Actually processed=15 is not a multiple of 10, so no publish for that.
    // But processed=10 triggers publish
    expect(mockPublish).toHaveBeenCalledTimes(1);
  });

  // ─── Error handling ────────────────────────────────────────────────────

  it("should handle validateEmail errors gracefully (create error records)", async () => {
    const emails = [makeEmail(0, "bad@test.com")];
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });
    mockValidateEmail.mockRejectedValue(new Error("SMTP timeout"));

    await loadWorkerModule();
    await capturedProcessor!(createMockJob({ totalEmails: 1 }));

    // Should create an error record
    expect(mockValidationCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            email: "b***@test.com",
            emailHash: "hashed:bad@test.com",
            score: 0,
            status: "unknown",
            checksJson: { error: "SMTP timeout" },
            processingTimeMs: 0,
          }),
        ]),
      }),
    );
    // Should log the error
    expect(mockLoggerWorkerError).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        email: "b***@test.com",
        jobId: "job-123",
        requestId: "req-123",
      }),
      "Failed to validate email",
    );
  });

  it("should count different validation statuses correctly", async () => {
    const emails = [
      { email: "valid@test.com" },
      { email: "invalid@test.com" },
      { email: "risky@test.com" },
      { email: "unknown@test.com" },
    ];
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });
    mockValidateEmail
      .mockResolvedValueOnce(makeValidationResult("valid@test.com", 95, "valid"))
      .mockResolvedValueOnce(makeValidationResult("invalid@test.com", 10, "invalid"))
      .mockResolvedValueOnce(makeValidationResult("risky@test.com", 50, "risky"))
      .mockResolvedValueOnce(makeValidationResult("unknown@test.com", 0, "unknown"));

    await loadWorkerModule();
    const result = await capturedProcessor!(createMockJob({ totalEmails: 4 }));

    expect(result.results).toEqual({
      valid: 1,
      invalid: 1,
      risky: 1,
      unknown: 1,
    });
  });

  // ─── Webhook dispatch ──────────────────────────────────────────────────

  it("should dispatch webhook on successful completion", async () => {
    const emails = [makeEmail(0, "a@test.com")];
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });

    await loadWorkerModule();
    await capturedProcessor!(createMockJob({ totalEmails: 1 }));

    expect(mockDispatchToUser).toHaveBeenCalledWith(
      "user-123",
      "bulk_job_completed",
      expect.objectContaining({
        jobId: "job-123",
        totalEmails: 1,
        results: { valid: 1, invalid: 0, risky: 0, unknown: 0 },
      }),
    );
  });

  it("should handle webhook dispatch failure gracefully (non-fatal)", async () => {
    const emails = [makeEmail(0, "a@test.com")];
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });
    mockDispatchToUser.mockRejectedValue(new Error("Network error"));

    await loadWorkerModule();
    // Should NOT throw — webhook failure is non-fatal
    await expect(capturedProcessor!(createMockJob({ totalEmails: 1 }))).resolves.toBeDefined();

    // Should log the failure
    expect(mockLoggerWorkerError).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        jobId: "job-123",
        requestId: "req-123",
      }),
      "Failed to dispatch webhooks",
    );
  });

  // ─── Edge cases ────────────────────────────────────────────────────────

  it("should throw when bulkJob is null", async () => {
    mockFindUnique.mockResolvedValue(null);

    await loadWorkerModule();
    await expect(capturedProcessor!(createMockJob())).rejects.toThrow(
      "No email data found for job job-123",
    );
  });

  it("should throw when emailsJson is null", async () => {
    mockFindUnique.mockResolvedValue({ emailsJson: null, processed: 0 });

    await loadWorkerModule();
    await expect(capturedProcessor!(createMockJob())).rejects.toThrow(
      "No email data found for job job-123",
    );
  });

  it("should handle empty emailsJson array (no validation calls)", async () => {
    mockFindUnique.mockResolvedValue({ emailsJson: [], processed: 0 });

    await loadWorkerModule();
    const result = await capturedProcessor!(createMockJob({ totalEmails: 0 }));

    expect(mockValidateEmail).not.toHaveBeenCalled();
    expect(mockValidationCreateMany).not.toHaveBeenCalled();
    expect(result.results).toEqual({
      valid: 0,
      invalid: 0,
      risky: 0,
      unknown: 0,
    });
  });

  // ─── Worker configuration ───────────────────────────────────────────────

  it("should create Worker with correct queue name, concurrency, and rate limiter", async () => {
    await loadWorkerModule();

    expect(capturedWorkerName).toBe("bulk-validation");
    expect(capturedWorkerOptions).toMatchObject({
      concurrency: 10,
      limiter: {
        max: 10,
        duration: 1000,
      },
    });
    expect(capturedWorkerOptions.connection).toBeDefined();
  });
});

// ===========================================================================
// EVENT HANDLER TESTS
// ===========================================================================

describe("Worker event handlers", () => {
  it("completed event should log completion", async () => {
    await loadWorkerModule();

    const completedHandler = capturedEventHandlers["completed"];
    expect(completedHandler).toBeDefined();

    const mockJob = createMockJob();
    completedHandler(mockJob);

    expect(mockLoggerWorkerInfo).toHaveBeenCalledWith(
      { jobId: "job-123", requestId: "req-123" },
      "Job completed successfully",
    );
  });

  it("completed event should handle missing requestId", async () => {
    await loadWorkerModule();

    const completedHandler = capturedEventHandlers["completed"];
    completedHandler({ id: "job-456", data: {} });

    expect(mockLoggerWorkerInfo).toHaveBeenCalledWith(
      { jobId: "job-456", requestId: undefined },
      "Job completed successfully",
    );
  });

  it("failed event without job should log generic error", async () => {
    await loadWorkerModule();

    const failedHandler = capturedEventHandlers["failed"];
    expect(failedHandler).toBeDefined();

    const err = new Error("Connection lost");
    failedHandler(null, err);

    expect(mockLoggerWorkerError).toHaveBeenCalledWith(
      { err: { message: "Connection lost" } },
      "A job failed with no job data available",
    );
  });

  it("failed event on final attempt should log and update status to FAILED", async () => {
    await loadWorkerModule();

    const failedHandler = capturedEventHandlers["failed"];
    const err = new Error("Timeout after retries");
    const mockJob = createMockJob({
      attemptsMade: 3,
      opts: { attempts: 3 },
    });

    failedHandler(mockJob, err);

    // Should log final failure message
    expect(mockLoggerWorkerError).toHaveBeenCalledWith(
      expect.objectContaining({
        err: { message: "Timeout after retries" },
        jobId: "job-123",
        requestId: "req-123",
        attemptsMade: 3,
        maxAttempts: 3,
      }),
      "Job FAILED after all attempts (sent to DLQ)",
    );

    // Should update job status to FAILED in the DB
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-123" },
        data: { status: "FAILED" },
      }),
    );
  });

  it("failed event on non-final attempt should log but not update status", async () => {
    await loadWorkerModule();

    const failedHandler = capturedEventHandlers["failed"];
    const err = new Error("Temporary failure");
    const mockJob = createMockJob({
      attemptsMade: 1,
      opts: { attempts: 3 },
    });

    failedHandler(mockJob, err);

    // Should log failure (not final)
    expect(mockLoggerWorkerError).toHaveBeenCalledWith(
      expect.objectContaining({
        err: { message: "Temporary failure" },
        jobId: "job-123",
        requestId: "req-123",
        attemptsMade: 1,
        maxAttempts: 3,
      }),
      "Job failed",
    );

    // Should NOT update job status (only on final attempt)
    const updateCalls = mockUpdate.mock.calls.filter(
      (call: any) => call[0]?.data?.status === "FAILED",
    );
    expect(updateCalls).toHaveLength(0);
  });

  it("failed event should handle missing jobId gracefully (no prisma update)", async () => {
    await loadWorkerModule();

    const failedHandler = capturedEventHandlers["failed"];
    const err = new Error("Test error");
    const mockJob = createMockJob({
      data: { requestId: "req-123" }, // no jobId
      attemptsMade: 3,
      opts: { attempts: 3 },
    });

    failedHandler(mockJob, err);

    // Should log but not crash
    expect(mockLoggerWorkerError).toHaveBeenCalled();
    // No status update since job.data.jobId is missing
    expect(mockUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "FAILED" },
      }),
    );
  });

  it("failed event should handle default attempts when opts.attempts is undefined", async () => {
    await loadWorkerModule();

    const failedHandler = capturedEventHandlers["failed"];
    const err = new Error("Test");
    const mockJob = createMockJob({
      attemptsMade: 3,
      opts: {}, // no attempts defined
    });

    failedHandler(mockJob, err);

    // Should use default maxAttempts = 3
    expect(mockLoggerWorkerError).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptsMade: 3,
        maxAttempts: 3,
      }),
      "Job FAILED after all attempts (sent to DLQ)",
    );
  });

  it("failed event should handle prisma update failure gracefully (catch path)", async () => {
    await loadWorkerModule();

    const failedHandler = capturedEventHandlers["failed"];
    const err = new Error("Final failure");
    const mockJob = createMockJob({
      attemptsMade: 3,
      opts: { attempts: 3 },
    });

    // Make prisma.bulkJob.update reject so the .catch() path is exercised
    mockUpdate.mockRejectedValue(new Error("DB update error"));

    failedHandler(mockJob, err);

    // Wait for the promise .catch() to execute (it's not awaited)
    await vi.waitFor(() => {
      expect(mockLoggerWorkerError).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.any(Error),
          jobId: "job-123",
        }),
        "Failed to update job status to FAILED",
      );
    });
  });

  it("error event should log worker error", async () => {
    await loadWorkerModule();

    const errorHandler = capturedEventHandlers["error"];
    expect(errorHandler).toBeDefined();

    const err = new Error("Redis connection lost");
    errorHandler(err);

    expect(mockLoggerWorkerError).toHaveBeenCalledWith({ err }, "Worker error");
  });
});

// ===========================================================================
// GRACEFUL SHUTDOWN TESTS
// ===========================================================================

describe("Worker graceful shutdown", () => {
  it("SIGTERM should close worker and quit Redis connection", async () => {
    await loadWorkerModule();

    const sigtermHandler = capturedProcessHandlers["SIGTERM"];
    expect(sigtermHandler).toBeDefined();

    await sigtermHandler();

    expect(mockLoggerWorkerInfo).toHaveBeenCalledWith("SIGTERM received, closing gracefully...");
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockRedisQuit).toHaveBeenCalledTimes(1);
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("SIGINT should close worker and quit Redis connection", async () => {
    await loadWorkerModule();

    const sigintHandler = capturedProcessHandlers["SIGINT"];
    expect(sigintHandler).toBeDefined();

    await sigintHandler();

    expect(mockLoggerWorkerInfo).toHaveBeenCalledWith("SIGINT received, closing gracefully...");
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockRedisQuit).toHaveBeenCalledTimes(1);
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("should register both SIGTERM and SIGINT handlers", async () => {
    await loadWorkerModule();

    expect(capturedProcessHandlers["SIGTERM"]).toBeDefined();
    expect(capturedProcessHandlers["SIGINT"]).toBeDefined();
  });

  it("should log worker start message", async () => {
    await loadWorkerModule();

    expect(mockLoggerWorkerInfo).toHaveBeenCalledWith("BullMQ worker started, waiting for jobs...");
  });
});

// ===========================================================================
// INTEGRATION: end-to-end processor run with all features
// ===========================================================================

describe("Worker integration scenarios", () => {
  it("should process mixed valid/invalid/risky/unknown emails with batch flush", async () => {
    const emails = Array.from({ length: 53 }, (_, i) => ({
      email: `user${i}@test.com`,
    }));
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });

    // Alternate between valid, invalid, risky, and one error
    mockValidateEmail.mockImplementation((email: string) => {
      const idx = parseInt(email.match(/user(\d+)/)![1], 10);
      if (idx % 4 === 0) {
        return Promise.resolve(makeValidationResult(email, 90, "valid"));
      } else if (idx % 4 === 1) {
        return Promise.resolve(makeValidationResult(email, 10, "invalid"));
      } else if (idx % 4 === 2) {
        return Promise.resolve(makeValidationResult(email, 50, "risky"));
      } else {
        return Promise.reject(new Error(`Connection timeout for ${email}`));
      }
    });

    await loadWorkerModule();
    const result = await capturedProcessor!(createMockJob({ totalEmails: 53 }));

    // 53 emails: 14 valid, 13 invalid, 13 risky.
    // The 13 rejected emails (idx % 4 === 3) are caught in the catch block
    // which creates error records but does NOT increment results.unknown.
    // Results only count successful validations, not errors.
    expect(result.results).toEqual({
      valid: 14,
      invalid: 13,
      risky: 13,
      unknown: 0,
    });

    // 2 batch flushes (50 + 3) = 2 calls
    expect(mockValidationCreateMany).toHaveBeenCalledTimes(2);
    expect(result.processed).toBe(53);
  });

  it("should update progress at correct intervals during processing", async () => {
    const emails = Array.from({ length: 25 }, (_, i) => makeEmail(i));
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });

    await loadWorkerModule();
    await capturedProcessor!(createMockJob({ totalEmails: 25 }));

    // Progress updates at processed=10, 20
    expect(mockPublish).toHaveBeenCalledTimes(2);
    expect(mockPublish).toHaveBeenCalledWith(
      "job:job-123:progress",
      expect.stringContaining('"processed":10'),
    );
    expect(mockPublish).toHaveBeenCalledWith(
      "job:job-123:progress",
      expect.stringContaining('"processed":20'),
    );

    // Progress publishes should include percentage
    const publishCalls = mockPublish.mock.calls;
    const firstPayload = JSON.parse(publishCalls[0][1]);
    expect(firstPayload).toMatchObject({
      processed: 10,
      total: 25,
      percentage: 40,
    });
  });

  it("should finalize correctly when all emails fail validation", async () => {
    const emails = Array.from({ length: 5 }, (_, i) => ({
      email: `fail${i}@test.com`,
    }));
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });
    mockValidateEmail.mockRejectedValue(new Error("All failed"));

    await loadWorkerModule();
    const result = await capturedProcessor!(createMockJob({ totalEmails: 5 }));

    // All emails failed validation (rejected). The catch block creates
    // error records but does NOT increment results.unknown — results
    // only track successful validations, not thrown errors.
    expect(result.results).toEqual({
      valid: 0,
      invalid: 0,
      risky: 0,
      unknown: 0,
    });

    // Should have created 5 error records via createMany
    expect(mockValidationCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            score: 0,
            status: "unknown",
            checksJson: { error: "All failed" },
          }),
        ]),
      }),
    );

    // Status should be COMPLETED (the job itself succeeded, just all emails failed)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
  });
});
