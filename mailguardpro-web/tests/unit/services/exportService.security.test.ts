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

// A validation row whose fields could carry CSV/formula-injection payloads.
function injectionRow() {
  return {
    email: "=evil@x.com",
    score: 10,
    status: "invalid",
    checksJson: {
      format: { passed: false },
      mx: { passed: false },
      smtp: { passed: false },
      disposable: { passed: true },
      catchAll: { passed: true },
      generic: { passed: false },
      freeProvider: { passed: true },
      dnsbl: { passed: true },
      spf: { passed: false },
      dmarc: { passed: false },
      typo: { passed: true, suggestion: "=cmd|'/C calc'!A1" },
      domain: { reputation: "@malicious" },
    },
    processingTimeMs: 100,
  };
}

describe("exportService — CSV formula/injection sanitization (SEC)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidationFindMany.mockResolvedValue([injectionRow()]);
  });

  it("should neutralize a leading '=' in the email field", async () => {
    const result = await exportResults({ jobId: "job-1", format: "csv" });
    const content = result.toString();
    expect(content).toContain("'=evil@x.com");
    expect(content).not.toContain("\n=evil@x.com");
  });

  it("should neutralize a leading '=' in the typo suggestion field", async () => {
    const result = await exportResults({ jobId: "job-1", format: "csv" });
    const content = result.toString();
    expect(content).toContain("'=cmd|'/C calc'!A1");
  });

  it("should neutralize a leading '@' in the domain reputation field", async () => {
    const result = await exportResults({ jobId: "job-1", format: "csv" });
    const content = result.toString();
    expect(content).toContain("'@malicious");
  });

  it("should neutralize a leading '+' and '-' injection payload", async () => {
    mockValidationFindMany.mockResolvedValueOnce([
      {
        ...injectionRow(),
        email: "+evil@x.com",
        checksJson: { ...injectionRow().checksJson, typo: { passed: true, suggestion: "-drop" } },
      },
    ]);
    const result = await exportResults({ jobId: "job-1", format: "csv" });
    const content = result.toString();
    expect(content).toContain("'+evil@x.com");
    expect(content).toContain("'-drop");
  });
});

describe("exportService — unicode / encoding fidelity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should preserve accented and emoji characters in CSV (UTF-8)", async () => {
    mockValidationFindMany.mockResolvedValue([
      {
        email: "café@exemple.fr",
        score: 80,
        status: "valid",
        checksJson: {
          format: { passed: true },
          mx: { passed: true },
          smtp: { passed: true },
          domain: { reputation: "🚀 good" },
        },
        processingTimeMs: 50,
      },
    ]);
    const result = await exportResults({ jobId: "job-1", format: "csv" });
    const content = result.toString("utf-8");
    expect(content).toContain("café@exemple.fr");
    expect(content).toContain("🚀 good");
  });
});
