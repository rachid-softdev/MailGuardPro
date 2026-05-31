/**
 * Unit tests for worker/index.ts — DB read and resume logic.
 *
 * Tests that the worker:
 * 1. Reads emails from bulkJob.emailsJson (not Redis)
 * 2. Uses startIndex = bulkJobRecord.processed to skip processed emails
 * 3. Starts from beginning when processed = 0
 *
 * The worker is a BullMQ Worker with a complex setup. We mock all external
 * dependencies and verify behavior by examining what the worker callback does.
 *
 * Since the worker creates a Worker instance at module load time, we extract
 * the job processor function for direct testing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted helpers
// ---------------------------------------------------------------------------
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockValidationCreate = vi.hoisted(() => vi.fn());
const mockValidateEmail = vi.hoisted(() => vi.fn());
const mockPublish = vi.hoisted(() => vi.fn());
const mockDispatchToUser = vi.hoisted(() => vi.fn());

// We'll capture the processor function by intercepting the Worker constructor
let capturedProcessor: ((job: any) => Promise<any>) | null = null;

const mockWorkerOn = vi.hoisted(() => vi.fn());
const mockWorkerConstructor = vi.hoisted(() =>
  vi.fn((_name: string, processor: (job: any) => Promise<any>) => {
    capturedProcessor = processor;
    return {
      on: mockWorkerOn,
      close: vi.fn().mockResolvedValue(undefined),
    };
  }),
);

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("bullmq", () => ({
  Worker: mockWorkerConstructor,
  Job: vi.fn(),
}));

vi.mock("ioredis", () => ({
  default: vi.fn(() => ({
    publish: mockPublish,
    quit: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bulkJob: {
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
    validation: {
      create: mockValidationCreate,
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
  WEBHOOK_EVENTS: { BULK_JOB_COMPLETED: "bulk_job.completed" },
  createBulkJobCompletedPayload: vi.fn(() => ({ jobId: "test", results: {} })),
}));

// Silence console
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

// ---------------------------------------------------------------------------
// Import the worker module (triggers module-level construction)
// ---------------------------------------------------------------------------
async function loadWorkerModule(): Promise<((job: any) => Promise<any>) | null> {
  capturedProcessor = null;
  vi.resetModules();
  await import("@/worker/index");
  return capturedProcessor;
}

describe("Worker — DB read + resume logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;

    // Default: validateEmail succeeds
    mockValidateEmail.mockImplementation((email: string) =>
      Promise.resolve({
        email,
        score: 85,
        status: "valid",
        checks: {},
        processingTimeMs: 50,
      }),
    );

    // Default: bulkJob update succeeds
    mockUpdate.mockResolvedValue({});
    mockValidationCreate.mockResolvedValue({});
    mockPublish.mockResolvedValue(1);
    mockDispatchToUser.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ────────────────────────────────────────────
  // Helper: create a mock BullMQ job
  // ────────────────────────────────────────────

  function createMockJob(overrides: Record<string, any> = {}): any {
    return {
      id: "job-123",
      data: {
        jobId: "job-123",
        totalEmails: 10,
        userId: "user-123",
        ...overrides,
      },
      updateProgress: vi.fn(),
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

  // ────────────────────────────────────────────
  // Worker reads emails from DB (emailsJson)
  // ────────────────────────────────────────────

  it("should read emails from bulkJob.emailsJson (not Redis)", async () => {
    const processor = await loadWorkerModule();
    expect(processor).not.toBeNull();

    const emails = [makeEmail(0, "alice@test.com"), makeEmail(1, "bob@test.com")];
    mockFindUnique.mockResolvedValue({
      emailsJson: JSON.stringify(emails),
      processed: 0,
    });

    await processor!(createMockJob());

    // Should have called findUnique to get the emails
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-123" },
        select: { emailsJson: true, processed: true },
      }),
    );

    // Should have processed both emails via validateEmail
    expect(mockValidateEmail).toHaveBeenCalledWith("alice@test.com");
    expect(mockValidateEmail).toHaveBeenCalledWith("bob@test.com");
  });

  it("should throw when bulkJob has no emailsJson", async () => {
    const processor = await loadWorkerModule();

    mockFindUnique.mockResolvedValue({
      emailsJson: null,
      processed: 0,
    });

    await expect(processor!(createMockJob())).rejects.toThrow("No email data found");
  });

  it("should throw when bulkJob is null", async () => {
    const processor = await loadWorkerModule();

    mockFindUnique.mockResolvedValue(null);

    await expect(processor!(createMockJob())).rejects.toThrow("No email data found");
  });

  // ────────────────────────────────────────────
  // Resume support — startIndex = processed
  // ────────────────────────────────────────────

  it("should skip already-processed emails when processed > 0", async () => {
    const processor = await loadWorkerModule();

    const emails = [
      makeEmail(0, "skip0@test.com"),
      makeEmail(1, "skip1@test.com"),
      makeEmail(2, "keep2@test.com"),
      makeEmail(3, "keep3@test.com"),
    ];
    mockFindUnique.mockResolvedValue({
      emailsJson: JSON.stringify(emails),
      processed: 2, // first 2 already processed
    });

    const result = await processor!(createMockJob());

    // Should NOT have called validateEmail for the skipped emails
    expect(mockValidateEmail).not.toHaveBeenCalledWith("skip0@test.com");
    expect(mockValidateEmail).not.toHaveBeenCalledWith("skip1@test.com");

    // Should have processed from index 2 onward
    expect(mockValidateEmail).toHaveBeenCalledWith("keep2@test.com");
    expect(mockValidateEmail).toHaveBeenCalledWith("keep3@test.com");

    // Result should reflect total, not just what we processed this run
    expect(result.processed).toBe(10); // totalEmails from job data
  });

  it("should start from beginning when processed = 0", async () => {
    const processor = await loadWorkerModule();

    const emails = [makeEmail(0, "first@test.com"), makeEmail(1, "second@test.com")];
    mockFindUnique.mockResolvedValue({
      emailsJson: JSON.stringify(emails),
      processed: 0,
    });

    await processor!(createMockJob());

    // Should have processed both
    expect(mockValidateEmail).toHaveBeenCalledWith("first@test.com");
    expect(mockValidateEmail).toHaveBeenCalledWith("second@test.com");
    expect(mockValidateEmail).toHaveBeenCalledTimes(2);
  });

  it("should process all remaining emails after resume", async () => {
    const processor = await loadWorkerModule();

    const emails = Array.from({ length: 10 }, (_, i) => makeEmail(i));
    mockFindUnique.mockResolvedValue({
      emailsJson: JSON.stringify(emails),
      processed: 7, // 3 remaining
    });

    await processor!(createMockJob({ totalEmails: 10 }));

    // Should have processed emails at indices 7, 8, 9
    expect(mockValidateEmail).toHaveBeenCalledTimes(3);
    expect(mockValidateEmail).toHaveBeenCalledWith("test7@example.com");
    expect(mockValidateEmail).toHaveBeenCalledWith("test8@example.com");
    expect(mockValidateEmail).toHaveBeenCalledWith("test9@example.com");
  });

  it("should handle processed = totalEmails (all already done)", async () => {
    const processor = await loadWorkerModule();

    const emails = Array.from({ length: 10 }, (_, i) => makeEmail(i));
    mockFindUnique.mockResolvedValue({
      emailsJson: JSON.stringify(emails),
      processed: 10, // all done
    });

    await processor!(createMockJob({ totalEmails: 10 }));

    // No new emails to process
    expect(mockValidateEmail).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────
  // Validation results and tracking
  // ────────────────────────────────────────────

  it("should create validation records in DB for each email", async () => {
    const processor = await loadWorkerModule();

    const emails = [makeEmail(0, "alice@test.com")];
    mockFindUnique.mockResolvedValue({
      emailsJson: JSON.stringify(emails),
      processed: 0,
    });

    await processor!(createMockJob({ totalEmails: 1 }));

    expect(mockValidationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "alice@test.com",
          score: 85,
          status: "valid",
          userId: "user-123",
          bulkJobId: "job-123",
        }),
      }),
    );
  });

  it("should update processed count every 10 emails", async () => {
    const processor = await loadWorkerModule();

    const emails = Array.from({ length: 12 }, (_, i) => makeEmail(i));
    mockFindUnique.mockResolvedValue({
      emailsJson: JSON.stringify(emails),
      processed: 0,
    });

    await processor!(createMockJob({ totalEmails: 12 }));

    // After 10 emails, processed should be updated
    // The 10th email (index 9) triggers update with processed = 10
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-123" },
        data: expect.objectContaining({ processed: 10 }),
      }),
    );
  });

  it("should handle validateEmail errors gracefully", async () => {
    const processor = await loadWorkerModule();

    const emails = [makeEmail(0, "bad@test.com")];
    mockFindUnique.mockResolvedValue({
      emailsJson: JSON.stringify(emails),
      processed: 0,
    });

    // validateEmail throws
    mockValidateEmail.mockRejectedValue(new Error("Validation failed"));

    await processor!(createMockJob({ totalEmails: 1 }));

    // Should have created an error validation record
    expect(mockValidationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "bad@test.com",
          score: 0,
          status: "unknown",
        }),
      }),
    );
  });

  // ────────────────────────────────────────────
  // Status updates
  // ────────────────────────────────────────────

  it("should set job status to PROCESSING at start", async () => {
    const processor = await loadWorkerModule();

    const emails = [makeEmail(0, "a@test.com")];
    mockFindUnique.mockResolvedValue({
      emailsJson: JSON.stringify(emails),
      processed: 0,
    });

    await processor!(createMockJob({ totalEmails: 1 }));

    // First update should set status to PROCESSING
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
    const processor = await loadWorkerModule();

    const emails = [makeEmail(0, "a@test.com")];
    mockFindUnique.mockResolvedValue({
      emailsJson: JSON.stringify(emails),
      processed: 0,
    });

    await processor!(createMockJob({ totalEmails: 1 }));

    // The final update should set COMPLETED with processed = totalEmails
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
});
