"use client";

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

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
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<BulkJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Fetch jobs on mount
  useState(() => {
    fetchJobs();
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
      console.error("Failed to fetch jobs:", error);
    } finally {
      setLoading(false);
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
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      await uploadFile(files[0]);
    }
  };

  const uploadFile = async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      alert("Please upload a CSV file");
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
        pollJobStatus(data.data.jobId);
      } else {
        alert(data.error || "Upload failed");
      }
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const pollJobStatus = async (jobId: string) => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/bulk/${jobId}/status`);
        if (res.ok) {
          const data = await res.json();
          if (data.data) {
            setJobs((prev) =>
              prev.map((job) =>
                job.id === jobId
                  ? {
                      ...job,
                      status: data.data.status,
                      processed: data.data.processed,
                      completedAt: data.data.completedAt,
                    }
                  : job,
              ),
            );

            // Stop polling if completed or failed
            if (data.data.status === "COMPLETED" || data.data.status === "FAILED") {
              return;
            }
          }
        }
      } catch (error) {
        console.error("Poll failed:", error);
      }

      // Continue polling
      setTimeout(poll, 2000);
    };

    poll();
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

      {/* Upload Zone */}
      <div
        className={`card mb-8 ${dragActive ? "border-[var(--accent)]" : ""}`}
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
              <p className="text-xs text-[var(--text-muted)] mt-4">
                CSV should have an &quot;email&quot; column. Optional: firstName, lastName, company
              </p>
            </>
          )}
        </div>
      </div>

      {/* Jobs List */}
      <div className="card">
        <h2 className="text-lg font-display font-semibold mb-4">Recent Jobs</h2>

        {loading ? (
          <div className="text-center py-8">
            <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto" />
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
                  <tr key={job.id} className="border-b border-[var(--border)] last:border-0">
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
                          onClick={() => pollJobStatus(job.id)}
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
            No bulk jobs yet. Upload a CSV file above to get started!
          </div>
        )}
      </div>
    </div>
  );
}
