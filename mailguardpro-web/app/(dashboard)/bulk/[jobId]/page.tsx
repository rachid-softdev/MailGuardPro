"use client";

import { format } from "date-fns";
import { AlertCircle, AlertTriangle, ArrowLeft, Filter, Search } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PdfGenerator } from "@/components/export/PdfGenerator";
import { Button } from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ScoreGauge, ScoreMeter } from "@/components/validator/ScoreGauge";
import { useDebounce } from "@/hooks/useDebounce";
import { getScoreBand } from "@/lib/score";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => {
    if (job?.status === "COMPLETED") {
      fetchResults();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 h-3 w-24 animate-skeleton" />
          <div className="mb-8 space-y-3">
            <div className="h-3 w-32 animate-skeleton" />
            <div className="h-9 w-72 max-w-full animate-skeleton" />
            <div className="h-4 w-56 animate-skeleton" />
          </div>
          <div className="grid grid-cols-2 gap-px border border-[var(--line)] bg-[var(--line)] sm:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-[var(--surface)] p-4">
                <div className="h-2.5 w-16 animate-skeleton" />
                <div className="mt-3 h-8 w-16 animate-skeleton" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/bulk"
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
          >
            <ArrowLeft size={13} aria-hidden="true" />
            Back to Bulk
          </Link>
          <div className="mt-6 border border-[var(--line-strong)] bg-[var(--surface)] px-6 py-14 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center border border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] text-[var(--status-invalid-text)]">
              <Search size={17} aria-hidden="true" />
            </span>
            <h2 className="mt-4 font-display text-xl font-semibold text-[var(--ink)]">
              Job not found
            </h2>
            <p className="mt-2 text-sm text-[var(--ink-3)]">
              {error || "This job does not exist or has been removed."}
            </p>
            <Button href="/bulk" variant="primary" className="mt-5">
              Back to Bulk Jobs
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const percent = (value: number) =>
    job.totalEmails > 0 ? Math.round((value / job.totalEmails) * 100) : 0;
  const band = getScoreBand(job.avgScore);

  const stats = [
    { label: "Total", value: job.totalEmails.toLocaleString(), note: "addresses", color: "" },
    {
      label: "Valid",
      value: job.validCount.toLocaleString(),
      note: `${percent(job.validCount)}%`,
      color: "text-[var(--status-valid-text)]",
    },
    {
      label: "Invalid",
      value: job.invalidCount.toLocaleString(),
      note: `${percent(job.invalidCount)}%`,
      color: "text-[var(--status-invalid-text)]",
    },
    {
      label: "Avg score",
      value: String(job.avgScore),
      note: "/ 100",
      color: "",
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/bulk"
          className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
        >
          <ArrowLeft size={13} aria-hidden="true" />
          Back to Bulk
        </Link>

        <PageHeader
          className="mt-4"
          eyebrow={`Batch / ${job.status.toLowerCase()}`}
          title={job.filename}
          description={
            <>
              Uploaded {format(new Date(job.createdAt), "MMM d, yyyy HH:mm")}
              {job.completedAt &&
                ` — completed ${format(new Date(job.completedAt), "MMM d, yyyy HH:mm")}`}
            </>
          }
          actions={
            <>
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
            </>
          }
          meta={
            <>
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                {job.processed.toLocaleString()} / {job.totalEmails.toLocaleString()} processed
              </span>
              <span className="h-3 w-px bg-[var(--line)]" aria-hidden="true" />
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                Job {job.id.slice(0, 12)}
              </span>
            </>
          }
        />

        <div className="grid grid-cols-2 gap-px border border-[var(--line-strong)] bg-[var(--line)] sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-[var(--surface)] p-4">
              <p className="label-mono text-[8px]">{stat.label}</p>
              <p
                className={`mt-2 font-display text-3xl font-semibold leading-none tracking-[-0.04em] tabular ${stat.color || "text-[var(--ink)]"}`}
              >
                {stat.value}
              </p>
              <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
                {stat.note}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-px border border-[var(--line)] bg-[var(--line)] lg:grid-cols-[1.1fr_0.9fr]">
          <section className="bg-[var(--surface)] p-5">
            <p className="label-mono">Batch reading</p>
            <ScoreGauge score={job.avgScore} label="Average quality score" className="mt-5" />
          </section>
          <section className="bg-[var(--surface)] p-5">
            <p className="label-mono">Verdict</p>
            <p className="mt-3 font-display text-xl font-semibold tracking-[-0.02em] text-[var(--ink)]">
              {band.label}
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-2)]">
              {job.avgScore >= 76
                ? "The batch is clear to send. Keep the invalid rows out of your list."
                : job.avgScore >= 61
                  ? "Most of this batch passed the checks. Review the caution rows before sending."
                  : "A large share of this batch is risky. Clean the list before the next send."}
            </p>
            {job.riskyCount > 0 && (
              <p className="mt-4 border-l-2 border-[var(--status-risky)] bg-[var(--status-risky-bg)] px-3 py-2 text-[12px] leading-relaxed text-[var(--status-risky-text)]">
                {job.riskyCount.toLocaleString()} addresses flagged as risky
              </p>
            )}
            <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
              Average is not a verdict on individual rows
            </p>
          </section>
        </div>

        {job.status === "COMPLETED" && (
          <section className="mt-5 border border-[var(--line-strong)] bg-[var(--surface)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
              <div>
                <p className="label-mono">Rows</p>
                <h2 className="mt-1 font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                  Results
                </h2>
              </div>
              <p className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                {results?.total.toLocaleString() ?? "—"} records
              </p>
            </div>

            <div className="flex flex-col gap-2 border-b border-[var(--line)] p-4 sm:flex-row">
              <div className="relative flex-1">
                <Search
                  className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-3)]"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search emails..."
                  aria-label="Search results by email"
                  className="input w-full pl-9"
                />
              </div>
              <div className="relative">
                <Filter
                  className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-3)]"
                  aria-hidden="true"
                />
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  aria-label="Filter results by status"
                  className="input w-full appearance-none pl-9 pr-8 sm:w-44"
                >
                  <option value="">All statuses</option>
                  <option value="valid">Valid</option>
                  <option value="invalid">Invalid</option>
                  <option value="risky">Risky</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
            </div>

            {resultsError ? (
              <div className="px-6 py-12 text-center">
                <AlertCircle
                  className="mx-auto h-8 w-8 text-[var(--status-invalid)]"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-medium text-[var(--status-invalid-text)]">
                  Could not load results
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setResultsError(false);
                    fetchResults();
                  }}
                >
                  Retry
                </Button>
              </div>
            ) : resultsLoading ? (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Email</th>
                      <th scope="col">Score</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="text-right">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...Array(5)].map((_, i) => (
                      <tr key={i}>
                        <td>
                          <div className="h-3 w-48 animate-skeleton" />
                        </td>
                        <td>
                          <div className="h-3 w-12 animate-skeleton" />
                        </td>
                        <td>
                          <div className="h-3 w-16 animate-skeleton" />
                        </td>
                        <td>
                          <div className="ml-auto h-3 w-20 animate-skeleton" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : results && results.results.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Email</th>
                        <th scope="col">Score</th>
                        <th scope="col">Status</th>
                        <th scope="col" className="text-right">
                          Date
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.results.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <span className="font-mono text-[12px] text-[var(--ink)]">
                              {item.email}
                            </span>
                          </td>
                          <td>
                            <ScoreMeter score={item.score} />
                          </td>
                          <td>
                            <StatusBadge status={getStatusLabel(item.status)} />
                          </td>
                          <td className="text-right">
                            <span className="font-mono text-[10px] text-[var(--ink-3)]">
                              {format(new Date(item.createdAt), "MMM d, HH:mm")}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {results.totalPages > 1 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3">
                    <p className="font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
                      Showing {(results.page - 1) * results.limit + 1}–
                      {Math.min(results.page * results.limit, results.total)} of {results.total}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(results.totalPages, p + 1))}
                        disabled={page >= results.totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="px-6 py-12 text-center">
                <Search className="mx-auto h-8 w-8 text-[var(--ink-3)]" aria-hidden="true" />
                <p className="mt-3 text-sm text-[var(--ink-3)]">No results match your filters.</p>
                {(statusFilter || searchQuery) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      setStatusFilter("");
                      setSearchQuery("");
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            )}
          </section>
        )}

        {job.status === "PROCESSING" && (
          <section className="mt-5 border border-[var(--line-strong)] bg-[var(--surface)] px-6 py-12 text-center">
            <p className="label-mono">Batch in progress</p>
            <h3 className="mt-3 font-display text-xl font-semibold text-[var(--ink)]">
              The line is reading.
            </h3>
            <p className="mt-2 font-mono text-[11px] text-[var(--ink-2)]">
              {job.processed.toLocaleString()} / {job.totalEmails.toLocaleString()} addresses
            </p>
            <div className="mx-auto mt-5 h-1.5 w-full max-w-md bg-[var(--surface-3)]">
              <div
                className="h-full bg-[var(--accent)] transition-[width]"
                style={{ width: `${percent(job.processed)}%` }}
              />
            </div>
            <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
              {percent(job.processed)}% complete
            </p>
          </section>
        )}

        {job.status === "FAILED" && (
          <section className="mt-5 border border-[var(--line-strong)] bg-[var(--surface)] px-6 py-12 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center border border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] text-[var(--status-invalid-text)]">
              <AlertTriangle size={17} aria-hidden="true" />
            </span>
            <h3 className="mt-4 font-display text-xl font-semibold text-[var(--ink)]">
              Processing failed
            </h3>
            <p className="mt-2 text-sm text-[var(--ink-3)]">
              This job did not complete. Upload the file again to restart the batch.
            </p>
            <Button href="/bulk" variant="primary" className="mt-5">
              Back to Bulk Jobs
            </Button>
          </section>
        )}
      </div>
    </div>
  );
}
