// Service d'export multi-format (CSV, JSON, XLSX)
// PDF généré côté client avec jsPDF pour compatibilité Serverless

import { stringify } from "csv-stringify/sync";
import ExcelJS from "exceljs";
import { sanitizeForCsv } from "@/lib/emailSanitizer";
import { prisma } from "@/lib/prisma";
import type { ValidationChecks } from "./types";
import { ExportOptions } from "./types";

// NOTE: PDF est maintenant généré côté client via components/export/PdfGenerator.tsx
// pour compatibilité avec les environnements Serverless (Vercel, Netlify, Cloudflare)

export async function exportResults(options: ExportOptions): Promise<Buffer> {
  const { jobId, format, filters } = options;

  // Récupérer les résultats
  const where: any = { bulkJobId: jobId };

  if (filters?.status && filters.status.length > 0) {
    where.status = { in: filters.status };
  }

  if (filters?.minScore !== undefined) {
    where.score = { ...where.score, gte: filters.minScore };
  }

  if (filters?.maxScore !== undefined) {
    where.score = { ...where.score, lte: filters.maxScore };
  }

  const results = await prisma.validation.findMany({
    where,
    orderBy: { score: "desc" },
  });

  // Formater les résultats pour l'export
  const formattedResults = results.map((r) => {
    const checks = r.checksJson as unknown as ValidationChecks | null;
    return {
      email: r.email,
      score: r.score,
      status: r.status,
      formatValid: checks?.format?.passed,
      mxValid: checks?.mx?.passed,
      smtpValid: checks?.smtp?.passed,
      disposable: checks?.disposable?.passed,
      catchall: checks?.catchAll?.passed,
      generic: checks?.generic?.passed,
      freeProvider: checks?.freeProvider?.passed,
      dnsbl: checks?.dnsbl?.passed,
      spfValid: checks?.spf?.passed,
      dmarcValid: checks?.dmarc?.passed,
      typo: checks?.typo?.passed,
      suggestion: (checks?.typo as any)?.suggestion,
      domainReputation: (checks as any)?.domain?.reputation,
      processingTimeMs: r.processingTimeMs,
    };
  });

  switch (format) {
    case "csv":
      return exportCSV(formattedResults);
    case "json":
      return exportJSON(formattedResults, { jobId });
    case "xlsx":
      return exportXLSX(formattedResults, { jobId });
    case "pdf":
      // PDF est généré côté client via /api/v1/bulk/[jobId]/export-data
      // qui retourne les données JSON pour le composant PdfGenerator
      throw new Error("PDF is generated client-side. Use /export-data endpoint.");
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

function exportCSV(results: any[]): Buffer {
  const rows = results.map((r) => ({
    email: sanitizeForCsv(r.email),
    score: r.score,
    status: sanitizeForCsv(r.status),
    format_valid: r.formatValid,
    mx_valid: r.mxValid,
    smtp_valid: r.smtpValid,
    disposable: r.disposable,
    catchall: r.catchall,
    generic: r.generic,
    free_provider: r.freeProvider,
    dnsbl: r.dnsbl,
    spf_valid: r.spfValid,
    dmarc_valid: r.dmarcValid,
    typo: r.typo,
    suggestion: sanitizeForCsv(r.suggestion || ""),
    domain_reputation: sanitizeForCsv(r.domainReputation || ""),
    processing_time_ms: r.processingTimeMs,
  }));

  return Buffer.from(stringify(rows, { header: true, delimiter: "," }));
}

function exportJSON(results: any[], meta: { jobId: string }): Buffer {
  const summary = {
    valid: results.filter((r) => r.status === "valid").length,
    invalid: results.filter((r) => r.status === "invalid").length,
    risky: results.filter((r) => r.status === "risky").length,
    unknown: results.filter((r) => r.status === "unknown").length,
    avgScore:
      results.length > 0
        ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
        : 0,
  };

  return Buffer.from(
    JSON.stringify(
      {
        meta: {
          jobId: meta.jobId,
          exportedAt: new Date().toISOString(),
          totalEmails: results.length,
        },
        summary,
        results,
      },
      null,
      2,
    ),
  );
}

async function exportXLSX(results: any[], _meta: { jobId: string }): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MailGuard Pro";
  workbook.created = new Date();

  // Sheet 1: Summary
  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.addRows([
    ["Email Validation Report"],
    [""],
    ["Total emails", results.length],
    ["Valid", results.filter((r) => r.status === "valid").length],
    ["Invalid", results.filter((r) => r.status === "invalid").length],
    ["Risky", results.filter((r) => r.status === "risky").length],
    ["Unknown", results.filter((r) => r.status === "unknown").length],
    [""],
    [
      "Avg Score",
      results.length > 0
        ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
        : 0,
    ],
    ["Export date", new Date().toISOString()],
  ]);
  summarySheet.getRow(1).font = { size: 16, bold: true };

  // Sheet 2: Results
  const resultsSheet = workbook.addWorksheet("Results");
  resultsSheet.columns = [
    { header: "Email", key: "email", width: 35 },
    { header: "Score", key: "score", width: 8 },
    { header: "Status", key: "status", width: 12 },
    { header: "Format", key: "formatValid", width: 10 },
    { header: "MX", key: "mxValid", width: 8 },
    { header: "SMTP", key: "smtpValid", width: 8 },
    { header: "Disposable", key: "disposable", width: 12 },
    { header: "Catch-all", key: "catchall", width: 12 },
    { header: "Generic", key: "generic", width: 10 },
    { header: "Free Provider", key: "freeProvider", width: 14 },
    { header: "Suggestion", key: "suggestion", width: 30 },
    { header: "Domain Rep", key: "domainReputation", width: 14 },
  ];

  // Ajouter les données avec couleur conditionnelle sur le score
  results.forEach((r, _index) => {
    const row = resultsSheet.addRow(r);
    const scoreCell = row.getCell("score");

    // Couleur selon le score
    if (r.score > 70) {
      scoreCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "00C851" },
      };
    } else if (r.score > 40) {
      scoreCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF8800" },
      };
    } else {
      scoreCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "CC0000" },
      };
    }

    // Couleur de la rangée selon le status
    if (r.status === "invalid") {
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFEBEE" },
      };
    } else if (r.status === "risky") {
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF8E1" },
      };
    }
  });

  // Sheet 3: High Risk
  const highRiskSheet = workbook.addWorksheet("High Risk");
  highRiskSheet.columns = [
    { header: "Email", key: "email", width: 40 },
    { header: "Score", key: "score", width: 8 },
    { header: "Issue", key: "issue", width: 40 },
  ];

  const highRisk = results.filter((r) => r.score < 40);
  highRisk.forEach((r) => {
    let issue = [];
    if (!r.smtpValid) issue.push("SMTP failed");
    if (!r.disposable) issue.push("Disposable");
    if (!r.formatValid) issue.push("Invalid format");

    highRiskSheet.addRow({
      email: r.email,
      score: r.score,
      issue: issue.join(", ") || "Low score",
    });
  });

  return Buffer.from(await workbook.xlsx.writeBuffer()) as Buffer;
}
