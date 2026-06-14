"use client";

import { format } from "date-fns";
import { AlertCircle, AlertTriangle, ArrowLeft, Filter, Search } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { PdfGenerator } from "@/components/export/PdfGenerator";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ScoreCircle } from "@/components/validator/ScoreCircle";
import { useDebounce } from "@/hooks/useDebounce";

interface BulkJobDetail {
  id: string;
  filename: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  totalEmails: number;
  processed: number;
  validCount: number;
  invalidCount: number;
  riskyCount: number;
  avgScore: number;
  createdAt: string;
  completedAt?: string;
}

interface ValidationResultItem {
  id: string;
  email: string;
  score: number;
  status: "valid" | "invalid" | "risky" | "unknown";
  createdAt: string;
}

interface ResultsData {
  results: ValidationResultItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function BulkJobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const [job, setJob] = useState<BulkJobDetail | null>(null);
  const [results, setResults] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resultsError, setResultsError] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 400);

  const limit = 50;

  useEffect(() => {
    fetchJob();
  }, [jobId]);

  useEffect(() => {
    if (job?.status === "COMPLETED") {
      fetchResults();
    }
  }, [jobId, page, statusFilter, debouncedSearch, job?.status]);

  const fetchJob = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/bulk/${jobId}/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setJob(json.data);
      } else {
        setError(json.error || "Failed to load job");
      }
    } catch {
      setError("Job not found");
    } finally {
      setLoading(false);
    }
  };

  const fetchResults = async () => {
    setResultsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (statusFilter) params.set("status", statusFilter);
      if (debouncedSearch) params.set("email", debouncedSearch);

      const res = await fetch(`/api/v1/bulk/${jobId}/results?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setResults(json.data);
      }
    } catch {
      setResultsError(true);
    } finally {
      setResultsLoading(false);
    }
  };

  const getStatusLabel = (status: string): "valid" | "invalid" | "risky" | "unknown" => {
    if (status === "valid") return "valid";
    if (status === "invalid") return "invalid";
    if (status === "risky") return "risky";
    return "unknown";
  };

  if (loading) {
    return (
      <div className="p-8">
        {/* Back link skeleton */}
        <div className="h-4 w-24 bg-[var(--bg-subtle)] rounded animate-skeleton mb-6" />

        {/* Header skeleton */}
        <div className="mb-8">
          <div className="h-8 w-64 bg-[var(--bg-subtle)] rounded animate-skeleton mb-2" />
          <div className="h-5 w-48 bg-[var(--bg-subtle)] rounded animate-skeleton" />
        </div>

        {/* Stats skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card">
              <div className="h-3 w-16 bg-[var(--bg-subtle)] rounded animate-skeleton mb-2" />
              <div className="h-8 w-12 bg-[var(--bg-subtle)] rounded animate-skeleton mb-1" />
              <div className="h-3 w-20 bg-[var(--bg-subtle)] rounded animate-skeleton" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="p-8">
        <Link
          href="/bulk"
          className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Bulk
        </Link>
        <div className="card text-center py-12">
          <div className="w-16 h-16 bg-[var(--status-invalid)]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-[var(--status-invalid)]" />
          </div>
          <h2 className="text-xl font-display font-bold mb-2">Job Not Found</h2>
          <p className="text-[var(--text-muted)] mb-4">
            {error || "This job does not exist or has been removed."}
          </p>
          <Link href="/bulk" className="btn btn-primary">
            Back to Bulk Jobs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Back link */}
      <Link
        href="/bulk"
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Bulk
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold mb-1">{job.filename}</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Uploaded {format(new Date(job.createdAt), "MMM d, yyyy HH:mm")}
              {job.completedAt &&
                ` — Completed ${format(new Date(job.completedAt), "MMM d, yyyy HH:mm")}`}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {job.status === "COMPLETED" && <PdfGenerator jobId={jobId} />}
            <StatusBadge
              status={getStatusLabel(
                job.status === "COMPLETED"
                  ? "valid"
                  : job.status === "FAILED"
                    ? "invalid"
                    : "unknown",
              )}
            />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="card">
          <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-1">
            Total
          </p>
          <p className="text-2xl font-display font-bold">{job.totalEmails.toLocaleString()}</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">emails processed</p>
        </div>
        <div className="card">
          <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-1">
            Valid
          </p>
          <p className="text-2xl font-display font-bold text-[var(--status-valid)]">
            {job.validCount.toLocaleString()}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {job.totalEmails > 0 ? `${Math.round((job.validCount / job.totalEmails) * 100)}%` : "—"}
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-1">
            Invalid
          </p>
          <p className="text-2xl font-display font-bold text-[var(--status-invalid)]">
            {job.invalidCount.toLocaleString()}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {job.totalEmails > 0
              ? `${Math.round((job.invalidCount / job.totalEmails) * 100)}%`
              : "—"}
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mb-1">
            Avg Score
          </p>
          <p className="text-2xl font-display font-bold">{job.avgScore}</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">/ 100</p>
        </div>
      </div>

      {/* Score circle visual */}
      <div className="card mb-8">
        <div className="flex items-center gap-6">
          <ScoreCircle score={job.avgScore} size="lg" />
          <div>
            <h3 className="text-lg font-display font-semibold mb-1">Overall Quality Score</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              {job.avgScore >= 75
                ? "Great deliverability expected"
                : job.avgScore >= 50
                  ? "Moderate — some emails may bounce"
                  : "Poor — high risk of bounces and spam flags"}
            </p>
            {job.riskyCount > 0 && (
              <p className="text-sm text-[var(--status-risky)] mt-2">
                {job.riskyCount.toLocaleString()} emails flagged as risky
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Results section (only for completed jobs) */}
      {job.status === "COMPLETED" && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-display font-semibold">Results</h2>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search emails..."
                className="input pl-9"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="input pl-9 pr-8 appearance-none"
              >
                <option value="">All statuses</option>
                <option value="valid">Valid</option>
                <option value="invalid">Invalid</option>
                <option value="risky">Risky</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
          </div>

          {/* Results table */}
          {resultsError ? (
            <div className="text-center py-8 text-[var(--text-muted)]">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 text-[var(--status-invalid)]" />
              <p className="text-[var(--status-invalid)] font-medium">Could not load results</p>
              <button
                onClick={() => {
                  setResultsError(false);
                  fetchResults();
                }}
                className="btn btn-ghost btn-sm mt-2"
              >
                Retry
              </button>
            </div>
          ) : resultsLoading ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                      Email
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                      Score
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                      Status
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-3 px-4">
                        <div className="h-4 w-48 bg-[var(--bg-subtle)] rounded animate-skeleton" />
                      </td>
                      <td className="py-3 px-4">
                        <div className="h-4 w-12 bg-[var(--bg-subtle)] rounded animate-skeleton" />
                      </td>
                      <td className="py-3 px-4">
                        <div className="h-6 w-16 bg-[var(--bg-subtle)] rounded-full animate-skeleton" />
                      </td>
                      <td className="py-3 px-4">
                        <div className="h-4 w-20 bg-[var(--bg-subtle)] rounded animate-skeleton ml-auto" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : results && results.results.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                        Email
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                        Score
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                        Status
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.results.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)] transition-colors"
                      >
                        <td className="py-3 px-4">
                          <span className="font-mono text-sm">{item.email}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${item.score}%`,
                                  backgroundColor:
                                    item.score <= 25
                                      ? "var(--score-critical)"
                                      : item.score <= 40
                                        ? "var(--score-poor)"
                                        : item.score <= 60
                                          ? "var(--score-medium)"
                                          : item.score <= 75
                                            ? "var(--score-good)"
                                            : "var(--score-excellent)",
                                }}
                              />
                            </div>
                            <span className="text-xs font-mono">{item.score}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={getStatusLabel(item.status)} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="text-sm text-[var(--text-muted)]">
                            {format(new Date(item.createdAt), "MMM d, HH:mm")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {results.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-[var(--border)] mt-4">
                  <p className="text-sm text-[var(--text-muted)]">
                    Showing {(results.page - 1) * results.limit + 1}–
                    {Math.min(results.page * results.limit, results.total)} of {results.total}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="btn btn-ghost btn-sm"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(results.totalPages, p + 1))}
                      disabled={page >= results.totalPages}
                      className="btn btn-ghost btn-sm"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-[var(--text-muted)]">
              <Search className="w-12 h-12 mx-auto mb-3 text-[var(--text-muted)]" />
              <p>No results match your filters.</p>
              {(statusFilter || searchQuery) && (
                <button
                  onClick={() => {
                    setStatusFilter("");
                    setSearchQuery("");
                  }}
                  className="btn btn-ghost btn-sm mt-2"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Processing state */}
      {job.status === "PROCESSING" && (
        <div className="card text-center py-12">
          <div className="w-12 h-12 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-display font-semibold mb-2">Processing...</h3>
          <p className="text-[var(--text-muted)]">
            {job.processed.toLocaleString()} / {job.totalEmails.toLocaleString()} emails validated
          </p>
          <div className="max-w-md mx-auto mt-4">
            <div className="w-full h-2 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] rounded-full transition-all"
                style={{ width: `${Math.round((job.processed / job.totalEmails) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Failed state */}
      {job.status === "FAILED" && (
        <div className="card text-center py-12">
          <div className="w-16 h-16 bg-[var(--status-invalid)]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-[var(--status-invalid)]" />
          </div>
          <h3 className="text-lg font-display font-semibold mb-2">Processing Failed</h3>
          <p className="text-[var(--text-muted)] mb-4">
            This job did not complete successfully. Please try uploading the file again.
          </p>
          <Link href="/bulk" className="btn btn-primary">
            Back to Bulk Jobs
          </Link>
        </div>
      )}
    </div>
  );
}
