import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted for proper mock hoisting
const { mockValidationFindMany } = vi.hoisted(() => ({
  mockValidationFindMany: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    validation: {
      findMany: mockValidationFindMany,
    },
    bulkJob: {
      findUnique: vi.fn().mockResolvedValue({ id: "job-123", filename: "test.csv" }),
    },
  },
}));

import { exportResults } from "@/services/exportService";

describe("exportService", () => {
  const mockValidationData = [
    {
      email: "valid@example.com",
      score: 85,
      status: "valid",
      checksJson: {
        format: { passed: true },
        mx: { passed: true },
        smtp: { passed: true },
        disposable: { passed: true },
        catchAll: { passed: true },
        generic: { passed: true },
        freeProvider: { passed: true },
        dnsbl: { passed: true },
        spf: { passed: true },
        dmarc: { passed: true },
        typo: { passed: true },
      },
      processingTimeMs: 150,
    },
    {
      email: "invalid@example.com",
      score: 25,
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
        typo: { passed: true, suggestion: "correct@example.com" },
      },
      processingTimeMs: 200,
      domain: { reputation: "good" },
    },
    {
      email: "risky@example.com",
      score: 55,
      status: "risky",
      checksJson: {
        format: { passed: true },
        mx: { passed: true },
        smtp: { passed: false },
      },
      processingTimeMs: 180,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockValidationFindMany.mockResolvedValue(mockValidationData);
  });

  describe("exportResults", () => {
    it("should export CSV format", async () => {
      const result = await exportResults({
        jobId: "test-job",
        format: "csv",
      });
      expect(result).toBeDefined();
      expect(Buffer.isBuffer(result)).toBe(true);

      const content = result.toString();
      expect(content).toContain("email");
      expect(content).toContain("valid@example.com");
      expect(content).toContain("invalid@example.com");
    });

    it("should export CSV with all check columns", async () => {
      const result = await exportResults({
        jobId: "test-job",
        format: "csv",
      });

      const content = result.toString();
      expect(content).toContain("score");
      expect(content).toContain("status");
      expect(content).toContain("format_valid");
      expect(content).toContain("mx_valid");
      expect(content).toContain("smtp_valid");
    });

    it("should export JSON format with summary", async () => {
      const result = await exportResults({
        jobId: "test-job",
        format: "json",
      });
      expect(result).toBeDefined();
      expect(Buffer.isBuffer(result)).toBe(true);

      const content = result.toString();
      const parsed = JSON.parse(content);

      expect(parsed.meta).toBeDefined();
      expect(parsed.meta.jobId).toBe("test-job");
      expect(parsed.meta.exportedAt).toBeDefined();
      expect(parsed.meta.totalEmails).toBe(3);

      expect(parsed.summary).toBeDefined();
      expect(parsed.summary.valid).toBe(1);
      expect(parsed.summary.invalid).toBe(1);
      expect(parsed.summary.risky).toBe(1);
      expect(parsed.summary.unknown).toBe(0);
      expect(parsed.summary.avgScore).toBe(55); // (85+25+55)/3 = 55
    });

    it("should export JSON with empty results when no data", async () => {
      mockValidationFindMany.mockResolvedValueOnce([]);

      const result = await exportResults({
        jobId: "test-job",
        format: "json",
      });

      const content = result.toString();
      const parsed = JSON.parse(content);

      expect(parsed.summary.valid).toBe(0);
      expect(parsed.summary.avgScore).toBe(0);
    });

    it("should export XLSX format with multiple sheets", async () => {
      const result = await exportResults({
        jobId: "test-job",
        format: "xlsx",
      });
      expect(result).toBeDefined();
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should include check results in export", async () => {
      const result = await exportResults({
        jobId: "test-job",
        format: "csv",
      });

      const content = result.toString();
      // Should include various check results
      expect(content).toContain("disposable");
      expect(content).toContain("catchall");
    });

    it("should apply status filters", async () => {
      await exportResults({
        jobId: "test-job",
        format: "csv",
        filters: { status: ["valid"] },
      });

      expect(mockValidationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            bulkJobId: "test-job",
            status: { in: ["valid"] },
          }),
        }),
      );
    });

    it("should apply score filters", async () => {
      await exportResults({
        jobId: "test-job",
        format: "csv",
        filters: { minScore: 50, maxScore: 80 },
      });

      expect(mockValidationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            bulkJobId: "test-job",
            score: expect.objectContaining({
              gte: 50,
              lte: 80,
            }),
          }),
        }),
      );
    });

    it("should throw for PDF format", async () => {
      await expect(
        exportResults({
          jobId: "test-job",
          format: "pdf",
        }),
      ).rejects.toThrow("PDF is generated client-side");
    });

    it("should throw for unsupported format", async () => {
      await expect(
        exportResults({
          jobId: "test-job",
          format: "invalid" as any,
        }),
      ).rejects.toThrow("Unsupported format");
    });

    it("should sort results by score descending", async () => {
      await exportResults({
        jobId: "test-job",
        format: "csv",
      });

      expect(mockValidationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { score: "desc" },
        }),
      );
    });

    it("should include suggestion from typo check", async () => {
      const result = await exportResults({
        jobId: "test-job",
        format: "csv",
      });

      const content = result.toString();
      expect(content).toContain("suggestion");
    });

    it("should handle missing optional fields gracefully", async () => {
      mockValidationFindMany.mockResolvedValueOnce([
        {
          email: "minimal@example.com",
          score: 50,
          status: "unknown",
          checksJson: {},
          processingTimeMs: null,
        },
      ]);

      const result = await exportResults({
        jobId: "test-job",
        format: "csv",
      });

      expect(result).toBeDefined();
      const content = result.toString();
      expect(content).toContain("minimal@example.com");
    });

    it("should include domain reputation when available", async () => {
      const result = await exportResults({
        jobId: "test-job",
        format: "csv",
      });

      const content = result.toString();
      expect(content).toContain("domain_reputation");
    });

    // ── Additional coverage: XLSX empty results ────────────────────

    it("should export XLSX with empty results and summary zeroes", async () => {
      mockValidationFindMany.mockResolvedValueOnce([]);

      const result = await exportResults({ jobId: "test-job", format: "xlsx" });
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result);

      // Summary sheet — all counts zero
      const summary = workbook.getWorksheet("Summary");
      expect(summary).toBeDefined();
      expect(summary.getRow(3).getCell(2).value).toBe(0); // Total emails
      expect(summary.getRow(4).getCell(2).value).toBe(0); // Valid
      expect(summary.getRow(5).getCell(2).value).toBe(0); // Invalid
      expect(summary.getRow(6).getCell(2).value).toBe(0); // Risky
      expect(summary.getRow(7).getCell(2).value).toBe(0); // Unknown
      expect(summary.getRow(9).getCell(2).value).toBe(0); // Avg Score

      // Results sheet — header only
      const results = workbook.getWorksheet("Results");
      expect(results).toBeDefined();
      expect(results.rowCount).toBe(1);

      // High Risk sheet — header only
      const highRisk = workbook.getWorksheet("High Risk");
      expect(highRisk).toBeDefined();
      expect(highRisk.rowCount).toBe(1);
    });

    // ── Additional coverage: XLSX High Risk sheet ─────────────────

    it("should populate High Risk sheet with score<40 records only", async () => {
      const result = await exportResults({ jobId: "test-job", format: "xlsx" });
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result);

      const sheet = workbook.getWorksheet("High Risk");
      expect(sheet).toBeDefined();

      // Only 1 data row (score 25 — invalid@example.com)
      expect(sheet.rowCount).toBe(2); // header + 1 data row
      expect(sheet.getRow(2).getCell(1).value).toBe("invalid@example.com");
      expect(sheet.getRow(2).getCell(2).value).toBe(25);

      // Issue = failing checks: smtp failed, format invalid
      const issue = String(sheet.getRow(2).getCell(3).value ?? "");
      expect(issue).toContain("SMTP failed");
      expect(issue).toContain("Invalid format");

      // Score-55 record (risky@example.com) must NOT be in High Risk
      // getRow always returns a Row object; check cell value is null (no data)
      expect(sheet.getRow(3).getCell(1).value).toBeNull();
    });

    it("should show 'Low score' fallback in High Risk when all checks pass", async () => {
      mockValidationFindMany.mockResolvedValueOnce([
        {
          email: "lowscore-checks-pass@example.com",
          score: 35,
          status: "risky",
          checksJson: {
            format: { passed: true },
            mx: { passed: true },
            smtp: { passed: true },
            disposable: { passed: true },
            catchAll: { passed: true },
            generic: { passed: true },
            freeProvider: { passed: true },
            dnsbl: { passed: true },
            spf: { passed: true },
            dmarc: { passed: true },
            typo: { passed: true },
          },
          processingTimeMs: 120,
        },
      ]);

      const result = await exportResults({ jobId: "test-job", format: "xlsx" });
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result);

      const sheet = workbook.getWorksheet("High Risk");
      expect(sheet.rowCount).toBe(2);
      expect(sheet.getRow(2).getCell(3).value).toBe("Low score");
    });

    it("should concatenate multiple failing checks in High Risk issue", async () => {
      mockValidationFindMany.mockResolvedValueOnce([
        {
          email: "multi-fail@example.com",
          score: 25,
          status: "invalid",
          checksJson: {
            format: { passed: false },
            smtp: { passed: false },
            disposable: { passed: false },
            mx: { passed: true },
            catchAll: { passed: true },
            generic: { passed: true },
            freeProvider: { passed: true },
            dnsbl: { passed: true },
            spf: { passed: true },
            dmarc: { passed: true },
            typo: { passed: true },
          },
          processingTimeMs: 100,
        },
      ]);

      const result = await exportResults({ jobId: "test-job", format: "xlsx" });
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result);

      const sheet = workbook.getWorksheet("High Risk");
      expect(sheet.getRow(2).getCell(3).value).toBe("SMTP failed, Disposable, Invalid format");
    });

    // ── Additional coverage: XLSX cell coloring ───────────────────

    it("should apply color fills based on score and status in Results sheet", async () => {
      const result = await exportResults({ jobId: "test-job", format: "xlsx" });
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result);

      const sheet = workbook.getWorksheet("Results");
      expect(sheet).toBeDefined();

      // Row 2: score 85 > 70, status "valid" (no row fill) → score cell is green
      const scoreCell2 = sheet.getRow(2).getCell(2);
      expect(scoreCell2.fill?.fgColor?.argb?.toUpperCase()).toBe("00C851");

      // Row 3: status "invalid" → row fill FFEBEE applied AFTER scoreCell.fill,
      //        so it overrides the score cell. Check both row fill and score cell.
      expect(sheet.getRow(3).fill?.fgColor?.argb?.toUpperCase()).toBe("FFEBEE");
      expect(sheet.getRow(3).getCell(2).fill?.fgColor?.argb?.toUpperCase()).toBe("FFEBEE");

      // Row 4: status "risky" → row fill FFF8E1 (also overrides score cell)
      expect(sheet.getRow(4).fill?.fgColor?.argb?.toUpperCase()).toBe("FFF8E1");
      expect(sheet.getRow(4).getCell(2).fill?.fgColor?.argb?.toUpperCase()).toBe("FFF8E1");
    });

    // ── Additional coverage: CSV empty results ────────────────────

    it("should export CSV with header only when results are empty", async () => {
      mockValidationFindMany.mockResolvedValueOnce([]);

      const result = await exportResults({ jobId: "test-job", format: "csv" });
      expect(Buffer.isBuffer(result)).toBe(true);

      // csv-stringify returns empty string for empty records (no columns to infer)
      expect(result.length).toBe(0);
    });

    // ── Additional coverage: CSV injection defence ────────────────

    it("should sanitise CSV injection vectors in email field", async () => {
      mockValidationFindMany.mockResolvedValueOnce([
        {
          email: '=HYPERLINK("http://evil.com")',
          score: 50,
          status: "risky",
          checksJson: {
            format: { passed: true },
            mx: { passed: true },
          },
          processingTimeMs: 100,
        },
      ]);

      const result = await exportResults({ jobId: "test-job", format: "csv" });
      const content = result.toString();

      // The CSV output should contain the sanitised form (prepended ')
      expect(content).toContain("'=HYPERLINK");
    });

    // ── Additional coverage: CSV full column list ────────────────

    it("should include all expected CSV columns in header", async () => {
      const result = await exportResults({ jobId: "test-job", format: "csv" });
      const header = result.toString().trim().split("\n")[0];

      const expectedColumns = [
        "email",
        "score",
        "status",
        "format_valid",
        "mx_valid",
        "smtp_valid",
        "spf_valid",
        "dmarc_valid",
        "disposable",
        "catchall",
        "generic",
        "free_provider",
        "dnsbl",
        "typo",
        "suggestion",
        "domain_reputation",
        "processing_time_ms",
      ];

      for (const col of expectedColumns) {
        expect(header).toContain(col);
      }
    });

    // ── Additional coverage: filter edge cases ────────────────────

    it("should apply minScore filter without maxScore", async () => {
      await exportResults({
        jobId: "test-job",
        format: "csv",
        filters: { minScore: 50 },
      });

      const call = mockValidationFindMany.mock.calls[0][0];
      expect(call.where.score).toEqual({ gte: 50 });
      expect(call.where.score.lte).toBeUndefined();
    });

    it("should apply maxScore filter without minScore", async () => {
      await exportResults({
        jobId: "test-job",
        format: "csv",
        filters: { maxScore: 80 },
      });

      const call = mockValidationFindMany.mock.calls[0][0];
      expect(call.where.score).toEqual({ lte: 80 });
      expect(call.where.score.gte).toBeUndefined();
    });

    // ── Additional coverage: score boundary colours ───────────────

    it("should apply correct cell colour at score boundaries (70 → orange, 40 → red)", async () => {
      mockValidationFindMany.mockResolvedValueOnce([
        {
          email: "score70@example.com",
          score: 70,
          status: "valid",
          checksJson: { format: { passed: true }, mx: { passed: true } },
          processingTimeMs: 100,
        },
        {
          email: "score40@example.com",
          score: 40,
          status: "valid",
          checksJson: { format: { passed: true }, mx: { passed: true } },
          processingTimeMs: 100,
        },
      ]);

      const result = await exportResults({ jobId: "test-job", format: "xlsx" });
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result);
      const sheet = workbook.getWorksheet("Results");

      // Score 70 — NOT > 70 → skip green; IS > 40 → orange
      const fill70 = sheet.getRow(2).getCell(2).fill?.fgColor?.argb?.toUpperCase();
      expect(fill70).toBe("FF8800");

      // Score 40 — NOT > 70, NOT > 40 → red (else branch)
      const fill40 = sheet.getRow(3).getCell(2).fill?.fgColor?.argb?.toUpperCase();
      expect(fill40).toBe("CC0000");
    });

    // ── Additional coverage: average score rounding ───────────────

    it("should round average score correctly (85+25+54=164/3≈54.67→55)", async () => {
      mockValidationFindMany.mockResolvedValueOnce([
        {
          email: "a@example.com",
          score: 85,
          status: "valid",
          checksJson: { format: { passed: true }, mx: { passed: true }, smtp: { passed: true } },
          processingTimeMs: 100,
        },
        {
          email: "b@example.com",
          score: 25,
          status: "invalid",
          checksJson: { format: { passed: false }, mx: { passed: false }, smtp: { passed: false } },
          processingTimeMs: 100,
        },
        {
          email: "c@example.com",
          score: 54,
          status: "risky",
          checksJson: { format: { passed: true }, mx: { passed: true }, smtp: { passed: false } },
          processingTimeMs: 100,
        },
      ]);

      const result = await exportResults({ jobId: "test-job", format: "json" });
      const parsed = JSON.parse(result.toString());
      expect(parsed.summary.avgScore).toBe(55); // Math.round(54.67)
    });

    // ── Additional coverage: JSON full structure ──────────────────

    it("should export JSON with meta, summary, and results keys", async () => {
      const result = await exportResults({ jobId: "test-job", format: "json" });
      const parsed = JSON.parse(result.toString());

      expect(parsed).toHaveProperty("meta");
      expect(parsed).toHaveProperty("summary");
      expect(parsed).toHaveProperty("results");

      expect(parsed.meta).toHaveProperty("jobId");
      expect(parsed.meta).toHaveProperty("exportedAt");
      expect(parsed.meta).toHaveProperty("totalEmails");
      expect(parsed.meta.totalEmails).toBe(3);

      expect(Array.isArray(parsed.results)).toBe(true);
      expect(parsed.results).toHaveLength(3);
    });
  });
});
