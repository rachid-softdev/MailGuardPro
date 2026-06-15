"use client";

import DOMPurify from "dompurify";
import { useState } from "react";
import { sanitizeForHtml } from "@/lib/emailSanitizer";
import { logger } from "@/lib/logger";

interface ValidationResult {
  email: string;
  score: number;
  status: string;
}

interface ExportData {
  meta: {
    jobId: string;
    filename: string;
    generatedAt: string;
    totalEmails: number;
  };
  stats: {
    valid: number;
    invalid: number;
    risky: number;
    unknown: number;
    avgScore: number;
    deliverabilityRate: number;
  };
  recommendations: string[];
  highRiskEmails: { email: string; score: number; issue: string }[];
  results: ValidationResult[];
}

interface Props {
  jobId: string;
  children?: React.ReactNode;
}

export function PdfGenerator({ jobId }: Props) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatePdf = async () => {
    setGenerating(true);
    setError(null);
    try {
      // Fetch data
      const response = await fetch(`/api/v1/bulk/${jobId}/export-data`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { data }: { data: ExportData } = await response.json();

      // Generate PDF using browser print (simple approach)
      // For full PDF, jspdf needs to be installed: npm install jspdf
      const blocked = generatePdfWithBrowser(data);
      if (blocked) {
        setError("Popup blocked. Please allow popups to export PDF.");
      }
    } catch (error) {
      logger.error({ err: error }, "PDF generation failed");
      setError("Failed to generate PDF. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button onClick={generatePdf} disabled={generating} className="btn btn-primary">
        {generating ? "Generating..." : "Export PDF"}
      </button>
      {error && <p className="text-xs text-[var(--status-invalid)]">{error}</p>}
    </div>
  );
}

// Simple PDF generation using browser print to PDF
// Returns true if popup was blocked, false otherwise
function generatePdfWithBrowser(data: ExportData): boolean {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    logger.warn("Popup blocked: cannot export PDF");
    return true;
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Email Validation Report - ${sanitizeForHtml(data.meta.filename)}</title>
  <style>
    :root {
      --text-primary: #1a1a1a;
      --text-muted: #666;
      --bg-subtle: #f5f5f5;
      --border: #eee;
      --accent: #00A36C;
      --status-valid: #00A36C;
      --status-invalid: #dc3545;
      --status-risky: #e6a700;
      --bg-warning: #fff3cd;
      --border-warning: #e6a700;
      --bg-accent-soft: #f0f9f4;
    }
    body {
      font-family: Arial, sans-serif;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
      color: var(--text-primary);
    }
    h1 { margin-bottom: 10px; }
    .subtitle { color: var(--text-muted); font-size: 14px; margin-bottom: 30px; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
    .stat-box { background: var(--bg-subtle); padding: 20px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 24px; font-weight: bold; }
    .stat-label { font-size: 12px; color: var(--text-muted); margin-top: 5px; }
    .deliverability { text-align: center; padding: 30px; background: var(--bg-accent-soft); border-radius: 12px; margin-bottom: 30px; }
    .deliverability-value { font-size: 48px; font-weight: bold; color: var(--accent); }
    .recommendations { margin-bottom: 30px; }
    .recommendations h3 { margin-bottom: 10px; }
    .recommendations ul { list-style: none; padding: 0; }
    .recommendations li { padding: 8px 12px; background: var(--bg-warning); border: 1px solid var(--border-warning); border-radius: 6px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: var(--bg-subtle); padding: 10px; text-align: left; }
    td { padding: 8px 10px; border-bottom: 1px solid var(--border); }
    .valid { color: var(--status-valid); }
    .invalid { color: var(--status-invalid); }
    .risky { color: var(--status-risky); }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <h1>Email Validation Report</h1>
  <div class="subtitle">
    Generated: ${new Date(data.meta.generatedAt).toLocaleDateString()} | 
    File: ${data.meta.filename} | 
    Total: ${data.meta.totalEmails} emails
  </div>

  <div class="stats">
    <div class="stat-box">
      <div class="stat-value">${data.meta.totalEmails}</div>
      <div class="stat-label">Total</div>
    </div>
    <div class="stat-box">
      <div class="stat-value" style="color: var(--status-valid)">${data.stats.valid}</div>
      <div class="stat-label">Valid</div>
    </div>
    <div class="stat-box">
      <div class="stat-value" style="color: var(--status-invalid)">${data.stats.invalid}</div>
      <div class="stat-label">Invalid</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${data.stats.avgScore}</div>
      <div class="stat-label">Avg Score</div>
    </div>
  </div>

  <div class="deliverability">
    <div class="deliverability-value">${data.stats.deliverabilityRate}%</div>
    <div style="color: var(--text-muted)">Estimated Deliverability Rate</div>
  </div>

  ${
    data.recommendations.length > 0
      ? `
  <div class="recommendations">
    <h3>Recommendations</h3>
    <ul>
      ${data.recommendations.map((r) => `<li>${sanitizeForHtml(r)}</li>`).join("")}
    </ul>
  </div>
  `
      : ""
  }

  ${
    data.highRiskEmails.length > 0
      ? `
  <h3>High Risk Emails (Score &lt; 40)</h3>
  <table>
    <thead>
      <tr>
        <th>Email</th>
        <th>Score</th>
        <th>Issue</th>
      </tr>
    </thead>
    <tbody>
      ${data.highRiskEmails
        .map(
          (r) => `
        <tr>
          <td>${sanitizeForHtml(r.email)}</td>
          <td>${r.score}</td>
          <td>${sanitizeForHtml(r.issue)}</td>
        </tr>
      `,
        )
        .join("")}
    </tbody>
  </table>
  `
      : ""
  }

  <div class="no-print" style="margin-top: 30px; text-align: center;">
    <button onclick="window.print()" style="padding: 12px 24px; background: var(--accent); color: white; border: none; border-radius: 6px; cursor: pointer;">
      Print / Save as PDF
    </button>
  </div>
</body>
</html>
  `;

  // Sanitize full HTML through DOMPurify before document.write (defense-in-depth)
  let cleanHtml = html;
  try {
    if (DOMPurify?.sanitize) {
      // Preserve style tags — DOMPurify strips them by default
      // The PDF uses inline <style> for print formatting
      cleanHtml = DOMPurify.sanitize(html, {
        WHOLE_DOCUMENT: true,
        ADD_TAGS: ["style"],
      });
    }
  } catch {
    // Fallback: basic sanitization already applied via sanitizeForHtml()
    cleanHtml = html;
  }
  printWindow.document.write(cleanHtml);
  printWindow.document.close();
  return false;
}

// Also export as simple hook for more control
export function usePdfExport(jobId: string) {
  const [loading, setLoading] = useState(false);

  const exportPdf = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/bulk/${jobId}/export-data`);
      const { data } = await response.json();
      generatePdfWithBrowser(data);
    } finally {
      setLoading(false);
    }
  };

  return { exportPdf, loading };
}
