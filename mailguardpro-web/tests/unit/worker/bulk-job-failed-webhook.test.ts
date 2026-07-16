import { describe, expect, it, vi } from "vitest";

const mockUpdate = vi.fn();
const mockDispatchToUser = vi.fn();
const mockWorkerOn = vi.fn();
let capturedProcessor: ((job: any) => Promise<any>) | null = null;

const mockWorkerCtor = vi.fn().mockImplementation(function MockWorker(
  _name: string,
  processor: (job: any) => Promise<any>,
) {
  capturedProcessor = processor;
  this.on = mockWorkerOn;
  this.close = vi.fn().mockResolvedValue(undefined);
});

vi.mock("bullmq", () => ({
  default: { Worker: mockWorkerCtor },
  Worker: mockWorkerCtor,
  Job: vi.fn(),
  Queue: vi.fn(() => ({ add: vi.fn() })),
}));

vi.mock("ioredis", () => {
  const instance = { quit: vi.fn().mockResolvedValue(undefined), on: vi.fn() };
  const Redis = function () {
    return instance;
  };
  Redis.prototype = instance;
  return { default: Redis };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bulkJob: { update: mockUpdate, findUnique: vi.fn() },
    validation: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  },
}));

vi.mock("@/lib/redis", () => ({
  queueRedis: {
    on: vi.fn(),
    quit: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock("@/lib/emailHash", () => ({
  hashEmail: vi.fn((e: string) => `hash-${e}`),
  maskEmail: vi.fn((e: string) => `masked-${e}`),
}));

vi.mock("@/lib/logger", () => ({
  loggerWorker: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

vi.mock("@/services/emailValidator", () => ({
  validateEmail: vi.fn(),
}));

vi.mock("@/services/webhookDispatcher", () => ({
  WebhookDispatcher: { dispatchToUser: mockDispatchToUser },
  createBulkJobCompletedPayload: vi.fn(() => ({})),
  WEBHOOK_EVENTS: {
    BULK_JOB_COMPLETED: "bulk_job_completed",
    BULK_JOB_FAILED: "bulk_job_failed",
  },
}));

// Import triggers module execution which creates Worker and registers handlers
await import("@/worker/index");

function getFailedHandler(): (job: any, err: Error) => void {
  const failedCall = mockWorkerOn.mock.calls.find(([e]: [string]) => e === "failed");
  expect(failedCall).toBeDefined();
  return failedCall![1] as (job: any, err: Error) => void;
}

describe("BULK_JOB_FAILED status on worker failure", () => {
  it("should set FAILED status on final attempt", async () => {
    mockUpdate.mockResolvedValue({});

    const failedHandler = getFailedHandler();
    const mockJob = {
      data: { jobId: "job-123", userId: "user-1" },
      opts: { attempts: 3 },
      attemptsMade: 3,
      id: "bull-job-123",
    };
    const mockErr = new Error("SMTP timeout");

    failedHandler(mockJob, mockErr);

    const updateCall = mockUpdate.mock.calls.find(
      ([args]: any) => args.where?.id === "job-123" && args.data?.status === "FAILED",
    );
    expect(updateCall).toBeDefined();
  });

  it("should NOT update status on non-final failure", async () => {
    const failedHandler = getFailedHandler();
    const mockJob = {
      data: { jobId: "job-456", userId: "user-2" },
      opts: { attempts: 3 },
      attemptsMade: 1,
      id: "bull-job-456",
    };

    mockUpdate.mockClear();

    failedHandler(mockJob, new Error("Transient error"));

    const updateCall = mockUpdate.mock.calls.find(([args]: any) => args.where?.id === "job-456");
    expect(updateCall).toBeUndefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // REGRESSION GUARD (documents current broken behavior — DO NOT RELY ON THIS
  // AS A FEATURE). See report: PR #136 removed the BULK_JOB_FAILED webhook
  // dispatch from the worker's `failed` handler. On the final attempt the job
  // status is correctly set to FAILED, but no BULK_JOB_FAILED webhook is sent
  // to the user's configured endpoints, even though WEBHOOK_EVENTS.BULK_JOB_FAILED
  // still exists in the dispatcher. This test pins the CURRENT behavior so the
  // gap is visible; it should be flipped (expect a dispatch) once the worker is
  // fixed to notify on final failure.
  // ─────────────────────────────────────────────────────────────────────────
  it("REGRESSION: BULK_JOB_FAILED webhook is NOT dispatched on final attempt", async () => {
    mockDispatchToUser.mockResolvedValue({ total: 0, successful: 0, failed: 0 });

    const failedHandler = getFailedHandler();
    const mockJob = {
      data: { jobId: "job-789", userId: "user-3" },
      opts: { attempts: 3 },
      attemptsMade: 3,
      id: "bull-job-789",
    };

    mockDispatchToUser.mockClear();

    failedHandler(mockJob, new Error("SMTP timeout"));

    // CURRENT (buggy) behavior: webhook must NOT be dispatched.
    expect(mockDispatchToUser).not.toHaveBeenCalledWith(
      "user-3",
      "bulk_job_failed",
      expect.anything(),
    );
  });
});
