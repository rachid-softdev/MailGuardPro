// =============================================================================
// FEATURE GAP (P2) — Bulk job cancellation
// =============================================================================
// There is currently NO endpoint to cancel a bulk job that is PROCESSING
// (no DELETE /api/v1/bulk/[jobId] and no ?action=cancel on the status route).
// Once implemented (job status -> CANCELLED, worker checks a stop flag and
// cleans up partial results), the scenarios below should be covered.
//
// This file is intentionally skipped so the suite stays green; it documents
// the missing capability and the tests to add when it lands.
// =============================================================================

import { describe, it } from "vitest";

describe.skip("Bulk job cancellation (FEATURE GAP — not yet implemented)", () => {
  it("should cancel a PROCESSING job and stop the worker mid-flight", () => {
    // POST/DELETE /api/v1/bulk/[jobId] with action=cancel
    //   -> 200, status flips to CANCELLED
    //   -> worker detects cancellation, stops processing remaining emails
    //   -> partial results remain queryable
  });

  it("should refuse to cancel a job owned by another user (404, not 403)", () => {
    // cancellation must enforce ownership like the other bulk routes
  });

  it("should refuse to cancel an already COMPLETED/FAILED job", () => {
    // 409 Conflict or 400 — terminal states cannot be cancelled
  });
});
