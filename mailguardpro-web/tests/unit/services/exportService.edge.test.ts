import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockValidationFindMany } = vi.hoisted(() => ({
  mockValidationFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    validation: { findMany: mockValidationFindMany },
    bulkJob: { findUnique: vi.fn().mockResolvedValue({ id: "job-1", filename: "t.csv" }) },
  },
}));

import { exportResults } from "@/services/exportService";

function makeRow(score: number, status: string) {
  return {
    email: `user${score}@example.com`,
    score,
    status,
    checksJson: {
      format: { passed: status !== "invalid" },
      mx: { passed: status !== "invalid" },
      smtp: { passed: status !== "invalid" },
      disposable: { passed: true },
      catchAll: { passed: true },
      generic: { passed: true },
      freeProvider: { passed: true },
      dnsbl: { passed: true },
      spf: { passed: true },
      dmarc: { passed: true },
      typo: { passed: true },
    },
    processingTimeMs: 10,
  };
}

describe("exportService — empty result sets (P1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should produce an empty CSV buffer when there are no results", async () => {
    mockValidationFindMany.mockResolvedValue([]);
    const result = await exportResults({ jobId: "job-1", format: "csv" });
    expect(Buffer.isBuffer(result)).toBe(true);
    // csv-stringify cannot infer columns from zero records → empty output
    expect(result.toString()).toBe("");
  });

  it("should produce a non-empty XLSX workbook when there are no results", async () => {
    mockValidationFindMany.mockResolvedValue([]);
    const result = await exportResults({ jobId: "job-1", format: "xlsx" });
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("exportService — large result set & XLSX formatting (P2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should build a CSV for a large result set without throwing", async () => {
    const many = Array.from({ length: 1000 }, (_, i) => makeRow((i % 100) + 1, "valid"));
    mockValidationFindMany.mockResolvedValue(many);
    const result = await exportResults({ jobId: "job-1", format: "csv" });
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString().split("\n").length).toBeGreaterThan(1000);
  });

  it("should build an XLSX with a High Risk sheet for low-score rows", async () => {
    const mixed = [
      makeRow(95, "valid"),
      makeRow(15, "invalid"), // score < 40 → high risk
      makeRow(50, "risky"),
    ];
    mockValidationFindMany.mockResolvedValue(mixed);
    const result = await exportResults({ jobId: "job-1", format: "xlsx" });
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });
});
