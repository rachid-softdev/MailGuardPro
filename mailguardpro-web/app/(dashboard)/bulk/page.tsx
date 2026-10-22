"use client";

import { formatDistanceToNow } from "date-fns";
import { ArrowRight, FileText, RefreshCw, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui";
import { useOnlineStatusSync } from "@/hooks/useOnlineStatusSync";
import { usePolling } from "@/hooks/usePolling";
import { cn } from "@/lib/cn";
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

const STATUS_STAMP: Record<BulkJob["status"], string> = {
  PENDING: "stamp stamp-idle",
  PROCESSING: "stamp stamp-warn",
  COMPLETED: "stamp stamp-pass",
  FAILED: "stamp stamp-fail",
};

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
    // uploadFile is stable enough for this one-shot handler; it only closes over
    // state setters and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      await uploadFile(files[0]);
    }
  };

  const openFilePicker = () => fileInputRef.current?.click();

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          eyebrow="Bulk / batch intake"
          title="Send a batch through."
          description="Drop a CSV and the line takes it from there. Every row gets the same six checks, score, and exportable evidence."
          actions={
            <Button onClick={openFilePicker} variant="primary" size="sm">
              <Upload size={14} aria-hidden="true" />
              Select CSV File
            </Button>
          }
          meta={
            <>
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                CSV / up to 100,000 rows
              </span>
              <span className="h-3 w-px bg-[var(--line)]" aria-hidden="true" />
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                1 credit / row
              </span>
              <span className="h-3 w-px bg-[var(--line)]" aria-hidden="true" />
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                Live status
              </span>
            </>
          }
        />

        {errorMessage && (
          <div
            role="alert"
            className="mb-4 border border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] px-4 py-3 text-[13px] leading-relaxed text-[var(--status-invalid-text)]"
          >
            {errorMessage}
          </div>
        )}

        <div className="grid border border-[var(--line-strong)] bg-[var(--surface)] lg:grid-cols-[0.9fr_1.1fr]">
          <div className="border-b border-[var(--line)] p-5 lg:border-b-0 lg:border-r lg:p-6">
            <p className="label-mono flex items-center gap-2">
              <span className="h-1.5 w-1.5 bg-[var(--accent)]" aria-hidden="true" />
              01 / File
            </p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
              One column is enough.
            </h2>
            <p className="mt-2 max-w-[46ch] text-[13px] leading-relaxed text-[var(--ink-2)]">
              The file needs an <code className="font-mono text-[12px]">email</code> header. Extra
              columns are preserved in the export but never inspected.
            </p>

            <dl className="mt-5 grid grid-cols-2 gap-px border border-[var(--line)] bg-[var(--line)]">
              <div className="bg-[var(--surface)] px-3 py-2.5">
                <dt className="label-mono text-[8px]">Format</dt>
                <dd className="mt-1 font-mono text-[11px] text-[var(--ink)]">.csv / UTF-8</dd>
              </div>
              <div className="bg-[var(--surface)] px-3 py-2.5">
                <dt className="label-mono text-[8px]">Max rows</dt>
                <dd className="mt-1 font-mono text-[11px] text-[var(--ink)]">100,000</dd>
              </div>
            </dl>

            <details className="mt-4 border border-[var(--line)] bg-[var(--surface-2)]">
              <summary className="cursor-pointer px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]">
                CSV format guide
              </summary>
              <div className="border-t border-[var(--line)] p-3">
                <p className="text-[11px] leading-relaxed text-[var(--ink-2)]">
                  <strong className="text-[var(--ink)]">Required column:</strong>{" "}
                  <code className="font-mono">email</code>
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-2)]">
                  <strong className="text-[var(--ink)]">Optional:</strong>{" "}
                  <code className="font-mono">firstName</code>,{" "}
                  <code className="font-mono">lastName</code>,{" "}
                  <code className="font-mono">company</code>
                </p>
                <pre className="mt-3 overflow-x-auto border border-[var(--line)] bg-[var(--surface)] p-2.5 font-mono text-[10px] leading-relaxed text-[var(--ink-2)]">
                  {`email,firstName,lastName,company
alice@acme.com,Alice,Smith,Acme Corp
bob@beta.io,Bob,Jones,Beta Inc
carol@gamma.org,Carol,Lee,Gamma LLC`}
                </pre>
              </div>
            </details>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-4 py-2.5">
              <p className="label-mono">02 / Drop zone</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                {uploading ? "Uploading…" : "Ready"}
              </p>
            </div>

            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={cn(
                "flex flex-1 flex-col items-center justify-center px-6 py-10 text-center transition-colors",
                dragActive
                  ? "bg-[var(--accent-soft)] outline outline-1 -outline-offset-1 outline-[var(--accent)]"
                  : "bg-[var(--surface)]",
              )}
            >
              {uploading ? (
                <div>
                  <RefreshCw
                    size={24}
                    className="mx-auto animate-spin text-[var(--accent)]"
                    aria-hidden="true"
                  />
                  <p className="mt-4 text-sm font-medium text-[var(--ink)]">
                    Uploading and processing…
                  </p>
                  <p className="mt-1 text-xs text-[var(--ink-3)]">
                    Keep this tab open while the line reads the file.
                  </p>
                </div>
              ) : (
                <>
                  <span className="flex h-11 w-11 items-center justify-center border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink-2)]">
                    <FileText size={18} aria-hidden="true" />
                  </span>
                  <p className="mt-4 font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                    Drag and drop your CSV here
                  </p>
                  <p className="mt-1 text-[12px] text-[var(--ink-3)]">
                    or choose a file from your machine. Maximum 100,000 rows.
                  </p>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleFileSelect}
                  />

                  <Button variant="primary" onClick={openFilePicker} className="mt-5">
                    Select CSV File
                    <ArrowRight size={14} aria-hidden="true" />
                  </Button>
                  <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                    Nothing leaves your browser until you choose a file
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        <section className="mt-6 border border-[var(--line-strong)] bg-[var(--surface)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
            <div>
              <p className="label-mono">Batch ledger</p>
              <h2 className="mt-1 font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                Recent jobs
              </h2>
            </div>
            <Button onClick={() => void fetchJobs()} variant="ghost" size="sm" disabled={loading}>
              <RefreshCw size={12} className={cn(loading && "animate-spin")} aria-hidden="true" />
              Refresh
            </Button>
          </div>

          {loading ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">Status</th>
                    <th scope="col">Progress</th>
                    <th scope="col">Created</th>
                    <th scope="col" className="text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td>
                        <div className="h-3 w-40 animate-skeleton" />
                      </td>
                      <td>
                        <div className="h-3 w-16 animate-skeleton" />
                      </td>
                      <td>
                        <div className="h-2 w-28 animate-skeleton" />
                      </td>
                      <td>
                        <div className="h-3 w-20 animate-skeleton" />
                      </td>
                      <td>
                        <div className="ml-auto h-6 w-20 animate-skeleton" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : jobs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">Status</th>
                    <th scope="col">Progress</th>
                    <th scope="col">Created</th>
                    <th scope="col" className="text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => {
                    const percent = job.totalEmails
                      ? Math.round((job.processed / job.totalEmails) * 100)
                      : 0;

                    return (
                      <tr key={job.id}>
                        <td>
                          <p className="max-w-[240px] truncate font-medium text-[var(--ink)]">
                            {job.filename}
                          </p>
                          <p className="mt-0.5 font-mono text-[10px] text-[var(--ink-3)]">
                            {job.totalEmails.toLocaleString()} addresses
                          </p>
                        </td>
                        <td>
                          <span className={STATUS_STAMP[job.status]}>{job.status}</span>
                        </td>
                        <td>
                          {job.status === "PROCESSING" && (
                            <div className="flex items-center gap-2">
                              <span className="block h-1.5 w-24 bg-[var(--surface-3)]">
                                <span
                                  className="block h-full bg-[var(--accent)] transition-[width]"
                                  style={{ width: `${percent}%` }}
                                />
                              </span>
                              <span className="font-mono text-[10px] tabular text-[var(--ink-2)]">
                                {percent}%
                              </span>
                            </div>
                          )}
                          {job.status === "COMPLETED" && (
                            <span className="font-mono text-[10px] text-[var(--ink-3)] tabular">
                              {job.processed.toLocaleString()} / {job.totalEmails.toLocaleString()}
                            </span>
                          )}
                          {job.status === "PENDING" && (
                            <span className="font-mono text-[10px] text-[var(--ink-3)]">
                              Waiting…
                            </span>
                          )}
                          {job.status === "FAILED" && (
                            <span className="font-mono text-[10px] text-[var(--status-invalid-text)]">
                              Failed
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="text-[11px] text-[var(--ink-3)]">
                            {formatDistanceToNow(new Date(job.createdAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </td>
                        <td className="text-right">
                          {job.status === "COMPLETED" && (
                            <Button href={`/bulk/${job.id}`} variant="ghost" size="sm">
                              View Results
                            </Button>
                          )}
                          {job.status === "PROCESSING" && (
                            <Button
                              onClick={() => {
                                // Restart polling for this job (cancel any current, switch)
                                cancel();
                                setPollingJobId(null);
                                setTimeout(() => setPollingJobId(job.id), 0);
                              }}
                              variant="ghost"
                              size="sm"
                            >
                              Refresh
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <span className="flex h-9 w-9 items-center justify-center border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-3)]">
                <Upload size={16} aria-hidden="true" />
              </span>
              <p className="mt-3 text-sm font-medium text-[var(--ink)]">No batches on the line.</p>
              <p className="mt-1 max-w-[36ch] text-[12px] leading-relaxed text-[var(--ink-3)]">
                Upload a CSV above to start the first job. Results and exports appear here when it
                finishes.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
