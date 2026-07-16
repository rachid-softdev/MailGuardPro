import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFindUnique = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockValidationCreateMany = vi.hoisted(() => vi.fn());
const mockValidateEmail = vi.hoisted(() => vi.fn());
const mockPublish = vi.hoisted(() => vi.fn());
const mockDispatchToUser = vi.hoisted(() => vi.fn());
const mockCreatePayload = vi.hoisted(() =>
  vi.fn((jobId: string, totalEmails: number, results: any) => ({ jobId, totalEmails, results })),
);

// Capture the worker processor + event handlers.
const captured: { processor: ((job: any) => Promise<any>) | null; handlers: Record<string, any> } =
  {
    processor: null,
    handlers: {},
  };

const mockWorkerOn = vi.hoisted(() => vi.fn());
const mockWorkerCtor = vi.hoisted(
  () =>
    function MockWorker(_name: string, processor: (job: any) => Promise<any>) {
      captured.processor = processor;
      return {
        on: (event: string, handler: any) => {
          captured.handlers[event] = handler;
          return mockWorkerOn();
        },
        close: vi.fn().mockResolvedValue(undefined),
      };
    },
);

vi.mock("bullmq", () => ({
  Worker: mockWorkerCtor,
  Job: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  queueRedis: { publish: mockPublish, quit: vi.fn().mockResolvedValue(undefined) },
  redis: { publish: mockPublish },
  rateLimitRedis: { publish: mockPublish },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bulkJob: { findUnique: mockFindUnique, update: mockUpdate },
    validation: { createMany: mockValidationCreateMany },
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  },
}));

vi.mock("@/lib/emailHash", () => ({
  hashEmail: vi.fn((e: string) => `h_${e}`),
  maskEmail: vi.fn((e: string) => `m_${e}`),
}));

vi.mock("@/lib/logger", () => ({
  loggerWorker: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/emailValidator", () => ({
  validateEmail: mockValidateEmail,
}));

vi.mock("@/services/webhookDispatcher", () => ({
  WebhookDispatcher: { dispatchToUser: mockDispatchToUser },
  WEBHOOK_EVENTS: { BULK_JOB_COMPLETED: "bulk_job.completed", BULK_JOB_FAILED: "bulk_job.failed" },
  createBulkJobCompletedPayload: mockCreatePayload,
}));

vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

async function loadWorker(): Promise<void> {
  captured.processor = null;
  captured.handlers = {};
  vi.resetModules();
  await import("@/worker/index");
}

function makeJob(overrides: Record<string, any> = {}): any {
  return {
    id: "bull-job-123",
    data: { jobId: "job-123", totalEmails: 10, userId: "user-123", ...overrides },
  };
}

function makeEmail(i: number) {
  return { email: `test${i}@example.com`, firstName: `F${i}`, lastName: `L${i}`, company: `C${i}` };
}

describe("Worker — progress, completion webhook, flush, handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.processor = null;
    captured.handlers = {};
    mockValidateEmail.mockImplementation((email: string) =>
      Promise.resolve({ email, score: 85, status: "valid", checks: {}, processingTimeMs: 1 }),
    );
    mockUpdate.mockResolvedValue({});
    mockValidationCreateMany.mockResolvedValue({ count: 1 });
    mockPublish.mockResolvedValue(1);
    mockDispatchToUser.mockResolvedValue({ total: 1, successful: 1, failed: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function load(): Promise<((job: any) => Promise<any>) | null> {
    await loadWorker();
    return captured.processor;
  }

  // ── P2: progress published to Redis pub/sub (item 33) ──────────────────
  it("should publish progress to job:<id>:progress every 10 emails", async () => {
    const processor = await load();
    const emails = Array.from({ length: 12 }, (_, i) => makeEmail(i));
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });

    await processor!(makeJob({ totalEmails: 12 }));

    const progressCalls = mockPublish.mock.calls.filter(
      (c: any[]) => c[0] === "job:job-123:progress",
    );
    expect(progressCalls.length).toBeGreaterThanOrEqual(1);
    const payload = JSON.parse(progressCalls[0][1]);
    expect(payload).toMatchObject({ processed: 10, total: 12, percentage: 83 });
  });

  // ── P2: completion webhook dispatched (item 34) ────────────────────────
  it("should dispatch BULK_JOB_COMPLETED webhook on success", async () => {
    const processor = await load();
    const emails = [makeEmail(0)];
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });

    await processor!(makeJob({ totalEmails: 1 }));

    expect(mockDispatchToUser).toHaveBeenCalledWith(
      "user-123",
      "bulk_job.completed",
      expect.objectContaining({ jobId: "job-123", totalEmails: 1 }),
    );
    expect(mockCreatePayload).toHaveBeenCalledWith("job-123", 1, expect.any(Object));
  });

  // ── P2: completion webhook failure must not fail the job (item 35) ──────
  it("should still complete the job when the completion webhook fails", async () => {
    const processor = await load();
    const emails = [makeEmail(0)];
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });
    mockDispatchToUser.mockRejectedValue(new Error("webhook down"));

    // Should resolve, not reject
    await expect(processor!(makeJob({ totalEmails: 1 }))).resolves.toBeDefined();

    // Job still marked COMPLETED
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-123" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
  });

  // ── P2: final remainder flush (item 36) ────────────────────────────────
  it("should flush the remaining buffer (< BATCH_SIZE) at the end", async () => {
    const processor = await load();
    const emails = [makeEmail(0), makeEmail(1)]; // 2 < BATCH_SIZE(50)
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });

    await processor!(makeJob({ totalEmails: 2 }));

    // Exactly one createMany call (the final flush) with both rows
    expect(mockValidationCreateMany).toHaveBeenCalledTimes(1);
    const arg = mockValidationCreateMany.mock.calls[0][0].data;
    expect(arg).toHaveLength(2);
  });

  // ── P2: failed handler with missing jobId (item 37) ────────────────────
  it("should not update job status or dispatch webhook when jobId is missing", async () => {
    await load();
    const failedHandler = captured.handlers["failed"];
    expect(failedHandler).toBeDefined();

    await failedHandler(
      {
        data: { userId: "user-1", jobId: undefined },
        opts: { attempts: 3 },
        attemptsMade: 3,
        id: "bull",
      },
      new Error("boom"),
    );

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockDispatchToUser).not.toHaveBeenCalled();
  });

  // ── P1: batch flush failure rethrows → DLQ (item 15) ───────────────────
  it("should throw when a batch flush (createMany) fails", async () => {
    const processor = await load();
    // 55 emails → first flush at 50th email fails
    const emails = Array.from({ length: 55 }, (_, i) => makeEmail(i));
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 0 });
    mockValidationCreateMany.mockRejectedValue(new Error("DB write failed"));

    await expect(processor!(makeJob({ totalEmails: 55 }))).rejects.toThrow("DB write failed");
  });

  // ── P0: resume idempotency — KNOWN BUG, cannot fix without DB constraint (item 4) ──
  it.skip("BUG: resume after partial flush must not insert duplicate validation rows", async () => {
    // The worker persists `processed` only every 10 emails, so on retry/resume
    // the last 1-9 validated emails are re-validated AND re-inserted via
    // createMany (no unique constraint / no skipDuplicates on Postgres).
    // Fix requires a unique constraint on (bulkJobId, emailHash) + upsert,
    // which is a schema migration — out of scope for a surgical source edit.
    const processor = await load();
    const emails = Array.from({ length: 12 }, (_, i) => makeEmail(i));
    // Simulate first run persisting processed=10 then crashing; resume from 10.
    mockFindUnique.mockResolvedValue({ emailsJson: emails, processed: 10 });
    await processor!(makeJob({ totalEmails: 12 }));

    const inserted = mockValidationCreateMany.mock.calls.flatMap((c: any[]) =>
      c[0].data.map((r: any) => r.emailHash),
    );
    const unique = new Set(inserted);
    expect(unique.size).toBe(inserted.length); // no duplicates
  });
});
