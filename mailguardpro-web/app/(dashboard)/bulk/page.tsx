"use client";

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOnlineStatusSync } from "@/hooks/useOnlineStatusSync";
import { usePolling } from "@/hooks/usePolling";
import { logger } from "@/lib/logger";

interface BulkJob {
  id: string;
  filename: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  totalEmails: number;
  processed: number;
  createdAt: string;
  completedAt?: string;
}

export default function BulkPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<BulkJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);

  // Polling hook — active when a job is being processed
  const { cancel } = usePolling({
    fetcher: async () => {
      const res = await fetch(`/api/v1/bulk/${pollingJobId}/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    shouldStop: (data) => data?.data?.status === "COMPLETED" || data?.data?.status === "FAILED",
    interval: 2000,
    maxRetries: 50,
    enabled: !!pollingJobId,
    onError: (error) => {
      logger.error({ err: error }, "Poll failed");
    },
    onComplete: (data) => {
      if (data?.data) {
        setJobs((prev) =>
          prev.map((job) =>
            job.id === pollingJobId
              ? {
                  ...job,
                  status: data.data.status,
                  processed: data.data.processed,
                  completedAt: data.data.completedAt,
                }
              : job,
          ),
        );
      }
      setPollingJobId(null);
    },
  });

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/bulk");
      if (res.ok) {
        const data = await res.json();
        setJobs(data.data || []);
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to fetch jobs");
    } finally {
      setLoading(false);
    }
  };

  // Fetch jobs on mount
  useEffect(() => {
    fetchJobs();
  }, []);

  useOnlineStatusSync(fetchJobs);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      await uploadFile(files[0]);
    }
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      await uploadFile(files[0]);
    }
  };

  const uploadFile = async (file: File) => {
    setErrorMessage(null);
    if (!file.name.endsWith(".csv")) {
      setErrorMessage("Please upload a CSV file");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/v1/validate/bulk", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        // Add new job to list
        const newJob: BulkJob = {
          id: data.data.jobId,
          filename: file.name,
          status: "PENDING",
          totalEmails: data.data.totalEmails,
          processed: 0,
          createdAt: new Date().toISOString(),
        };
        setJobs((prev) => [newJob, ...prev]);

        // Poll for status updates
        setPollingJobId(data.data.jobId);
      } else {
        setErrorMessage(
          data.error ||
            "Upload failed — the server rejected the file. Ensure it contains valid emails (one per column, max 100,000 rows).",
        );
      }
    } catch (error) {
      logger.error({ err: error }, "Upload failed");
      setErrorMessage(
        "Upload failed due to a network error. Please check your connection and try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusClasses: Record<string, string> = {
      PENDING: "badge-default",
      PROCESSING: "badge-warning",
      COMPLETED: "badge-success",
      FAILED: "badge-error",
    };
    return statusClasses[status] || "badge-default";
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold mb-2">Bulk Validation</h1>
        <p className="text-[var(--text-secondary)]">
          Upload a CSV file to validate thousands of emails at once
        </p>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="animate-fade-slide-in mb-4 px-4 py-3 rounded-lg bg-[var(--status-invalid)]/10 border border-[var(--status-invalid)]/30 text-sm text-[var(--status-invalid)]">
          {errorMessage}
        </div>
      )}

      {/* Upload Zone */}
      <div
        className={`card mb-8 ${dragActive ? "border-[var(--accent)] bg-[var(--accent-light)]" : ""}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="text-center py-8">
          {uploading ? (
            <div>
              <div className="w-12 h-12 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-[var(--text-secondary)]">Uploading and processing...</p>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 bg-[var(--bg-subtle)] rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-[var(--text-muted)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <p className="text-lg font-medium mb-2">Drag and drop your CSV file here</p>
              <p className="text-sm text-[var(--text-muted)] mb-4">
                or click to browse. Maximum 100,000 rows.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileSelect}
              />
              <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
                Select CSV File
              </button>
              <details className="text-left mt-4 text-xs text-[var(--text-muted)]">
                <summary className="cursor-pointer hover:text-[var(--text-secondary)] transition-colors">
                  CSV format guide
                </summary>
                <div className="mt-2 space-y-1.5 bg-[var(--bg-elevated)] p-3 rounded-[var(--radius-md)]">
                  <p>
                    <strong>Required column:</strong>{" "}
                    <code className="font-mono bg-[var(--bg-subtle)] px-1 rounded">email</code>
                  </p>
                  <p>
                    <strong>Optional columns:</strong>{" "}
                    <code className="font-mono bg-[var(--bg-subtle)] px-1 rounded">firstName</code>,{" "}
                    <code className="font-mono bg-[var(--bg-subtle)] px-1 rounded">lastName</code>,{" "}
                    <code className="font-mono bg-[var(--bg-subtle)] px-1 rounded">company</code>
                  </p>
                  <p>
                    <strong>Limit:</strong> up to 100,000 rows per file
                  </p>
                  <p className="pt-1 border-t border-[var(--border)]">
                    <strong>Example CSV:</strong>
                  </p>
                  <pre className="font-mono text-[11px] leading-relaxed bg-[var(--bg-base)] p-2 rounded">
                    email,firstName,lastName,company{"\n"}
                    alice@acme.com,Alice,Smith,Acme Corp{"\n"}
                    bob@beta.io,Bob,Jones,Beta Inc{"\n"}
                    carol@gamma.org,Carol,Lee,Gamma LLC{"\n"}
                  </pre>
                </div>
              </details>
            </>
          )}
        </div>
      </div>

      {/* Jobs List */}
      <div className="card">
        <h2 className="text-lg font-display font-semibold mb-4">Recent Jobs</h2>

        {loading ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                    File
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                    Progress
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                    Created
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3].map((i) => (
                  <tr key={i} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-3 px-4">
                      <div className="space-y-2">
                        <div className="h-4 w-40 bg-[var(--bg-subtle)] rounded animate-skeleton" />
                        <div className="h-3 w-24 bg-[var(--bg-subtle)] rounded animate-skeleton" />
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-6 w-20 bg-[var(--bg-subtle)] rounded-full animate-skeleton" />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 bg-[var(--bg-subtle)] rounded-full animate-skeleton" />
                        <div className="h-4 w-8 bg-[var(--bg-subtle)] rounded animate-skeleton" />
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-4 w-20 bg-[var(--bg-subtle)] rounded animate-skeleton" />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="h-8 w-24 bg-[var(--bg-subtle)] rounded animate-skeleton ml-auto" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : jobs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                    File
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                    Progress
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                    Created
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)] transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium">{job.filename}</p>
                        <p className="text-sm text-[var(--text-muted)]">
                          {job.totalEmails.toLocaleString()} emails
                        </p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`badge ${getStatusBadge(job.status)}`}>{job.status}</span>
                    </td>
                    <td className="py-3 px-4">
                      {job.status === "PROCESSING" && (
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[var(--accent)] rounded-full transition-all"
                              style={{
                                width: `${Math.round((job.processed / job.totalEmails) * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-sm">
                            {Math.round((job.processed / job.totalEmails) * 100)}%
                          </span>
                        </div>
                      )}
                      {job.status === "COMPLETED" && (
                        <span className="text-sm text-[var(--text-muted)]">
                          {job.processed.toLocaleString()} / {job.totalEmails.toLocaleString()}
                        </span>
                      )}
                      {job.status === "PENDING" && (
                        <span className="text-sm text-[var(--text-muted)]">Waiting...</span>
                      )}
                      {job.status === "FAILED" && (
                        <span className="text-sm text-[var(--status-invalid)]">Failed</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-[var(--text-muted)]">
                        {formatDistanceToNow(new Date(job.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {job.status === "COMPLETED" && (
                        <Link href={`/bulk/${job.id}`} className="btn btn-ghost btn-sm">
                          View Results
                        </Link>
                      )}
                      {job.status === "PROCESSING" && (
                        <button
                          onClick={() => {
                            // Restart polling for this job (cancel any current, switch)
                            cancel();
                            setPollingJobId(null);
                            setTimeout(() => setPollingJobId(job.id), 0);
                          }}
                          className="btn btn-ghost btn-sm"
                        >
                          Refresh
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-[var(--text-muted)]">
            <svg
              className="w-12 h-12 mx-auto mb-3 text-[var(--text-muted)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            No bulk jobs yet. Upload a CSV file above to get started!
          </div>
        )}
      </div>
    </div>
  );
}
