"use client";

import { formatDistanceToNow } from "date-fns";
import { Inbox, Loader2, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useOnlineStatusSync } from "@/hooks/useOnlineStatusSync";
import { useSelection } from "@/hooks/useSelection";
import { useUndoHistory } from "@/hooks/useUndoHistory";
import { logger } from "@/lib/logger";

interface Validation {
  id: string;
  email: string;
  score: number;
  status: string;
  createdAt: string;
}

export default function HistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { pushUndo } = useUndoHistory();

  const [validations, setValidations] = useState<Validation[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  const selection = useSelection<string>();
  const [batchValidating, setBatchValidating] = useState(false);

  // Filters from URL
  const page = parseInt(searchParams.get("page") || "1");
  const statusFilter = searchParams.get("status") || "";
  const searchQuery = searchParams.get("search") || "";

  const fetchValidations = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", pagination.limit.toString());
      if (statusFilter) params.set("status", statusFilter);
      if (searchQuery) params.set("search", searchQuery);

      const res = await fetch(`/api/v1/validations?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setValidations(data.data || []);
        setPagination(data.meta?.pagination || pagination);
      } else {
        setFetchError("Failed to load validations. Please try again.");
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to fetch validations");
      setFetchError("Could not connect to server. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, searchQuery, pagination.limit]);

  useEffect(() => {
    fetchValidations();
  }, [fetchValidations]);

  useOnlineStatusSync(fetchValidations);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchInput, setSearchInput] = useState(searchQuery);

  const handleSearchInput = (value: string) => {
    setSearchInput(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (value) {
        params.set("search", value);
      } else {
        params.delete("search");
      }
      params.delete("page"); // reset page on new search
      router.replace(`/history?${params.toString()}`);
    }, 400);
  };

  // Sync input if URL changes externally
  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const handleStatusFilter = (status: string) => {
    const previousFilter = statusFilter;
    if (status) {
      router.replace(`/history?status=${status}`);
    } else {
      router.replace("/history");
    }
    pushUndo({
      label: `Filter by ${status || "all"}`,
      undo: () => {
        if (previousFilter) {
          router.replace(`/history?status=${previousFilter}`);
        } else {
          router.replace("/history");
        }
      },
      redo: () => {
        if (status) {
          router.replace(`/history?status=${status}`);
        } else {
          router.replace("/history");
        }
      },
    });
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", newPage.toString());
    router.replace(`/history?${params.toString()}`);
  };

  const handleBatchRevalidate = useCallback(async () => {
    const emails = validations.filter((v) => selection.selected.has(v.id)).map((v) => v.email);
    if (emails.length === 0) return;

    setBatchValidating(true);
    try {
      await fetch("/api/v1/validate/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      });
      selection.clear();
    } catch {
      logger.error({}, "Batch revalidation failed");
      setBatchError("Batch revalidation failed. Please try again.");
      setTimeout(() => setBatchError(null), 5000);
    } finally {
      setBatchValidating(false);
    }
  }, [validations, selection]);

  // Clear selection when filters change (new page, new search, new status filter)
  useEffect(() => {
    selection.clear();
  }, [page, statusFilter, searchQuery]);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold mb-2">Validation History</h1>
        <p className="text-[var(--text-secondary)]">View all your email validations</p>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchInput(e.target.value)}
              placeholder="Search by email…"
              className="input flex-1 pl-9"
            />
          </div>

          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => handleStatusFilter(e.target.value)}
              className="input"
            >
              <option value="">All Status</option>
              <option value="valid">Valid</option>
              <option value="invalid">Invalid</option>
              <option value="risky">Risky</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error state */}
      {fetchError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-[var(--status-invalid)]/10 border border-[var(--status-invalid)]/30 text-sm text-[var(--status-invalid)] flex items-center justify-between">
          <span>{fetchError}</span>
          <button
            onClick={() => {
              setFetchError(null);
              fetchValidations();
            }}
            className="text-xs font-medium underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Results */}
      <div className="card">
        {loading ? (
          <div className="divide-y divide-[var(--border)]">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-6 py-4 px-4">
                <div className="h-4 w-48 bg-[var(--bg-subtle)] animate-skeleton rounded" />
                <div className="h-4 w-12 bg-[var(--bg-subtle)] animate-skeleton rounded" />
                <div className="h-5 w-20 bg-[var(--bg-subtle)] animate-skeleton rounded-full" />
                <div className="h-4 w-28 bg-[var(--bg-subtle)] animate-skeleton rounded" />
                <div className="h-4 w-16 bg-[var(--bg-subtle)] animate-skeleton rounded ml-auto" />
              </div>
            ))}
          </div>
        ) : validations.length > 0 ? (
          <>
            {/* Batch action bar */}
            {selection.count > 0 && (
              <div className="flex items-center justify-between px-4 py-3 bg-[var(--accent-light)] border-b border-[var(--border)] rounded-t-lg">
                <p className="text-sm font-medium text-[var(--accent)]">
                  {selection.count} selected
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={selection.clear}
                    className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Deselect all
                  </button>
                  <button
                    onClick={handleBatchRevalidate}
                    disabled={batchValidating}
                    className="btn btn-accent btn-sm"
                  >
                    {batchValidating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Validating...
                      </>
                    ) : (
                      `Revalidate (${selection.count})`
                    )}
                  </button>
                </div>
              </div>
            )}
            {batchError && (
              <div className="px-4 py-2 text-sm text-[var(--status-invalid)] bg-[var(--status-invalid)]/5 border-b border-[var(--border)]">
                {batchError}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="w-10 py-3 px-4 text-left">
                      <input
                        type="checkbox"
                        checked={
                          selection.allSelected(validations.map((v) => v.id)) &&
                          validations.length > 0
                        }
                        onChange={() => selection.toggleAll(validations.map((v) => v.id))}
                        className="rounded border-[var(--border-strong)]"
                        aria-label="Select all validations"
                      />
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                      Email
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                      Score
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                      Date
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {validations.map((validation) => (
                    <tr
                      key={validation.id}
                      className={`border-b border-[var(--border)] last:border-0 transition-colors ${
                        selection.isSelected(validation.id)
                          ? "bg-[var(--accent-light)]"
                          : "hover:bg-[var(--bg-elevated)]"
                      }`}
                    >
                      <td className="w-10 py-3 px-4">
                        <input
                          type="checkbox"
                          checked={selection.isSelected(validation.id)}
                          onChange={() => selection.toggle(validation.id)}
                          className="rounded border-[var(--border-strong)]"
                          aria-label={`Select ${validation.email}`}
                        />
                      </td>
                      <td className="py-3 px-4 font-mono text-sm">{validation.email}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-bold ${
                            validation.score >= 75
                              ? "text-[var(--status-valid)]"
                              : validation.score >= 40
                                ? "text-[var(--status-risky)]"
                                : "text-[var(--status-invalid)]"
                          }`}
                        >
                          {validation.score}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge
                          status={validation.status as "valid" | "invalid" | "risky" | "unknown"}
                        />
                      </td>
                      <td className="py-3 px-4 text-sm text-[var(--text-muted)]">
                        {formatDistanceToNow(new Date(validation.createdAt), {
                          addSuffix: true,
                        })}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() =>
                            router.push(`/validate?email=${encodeURIComponent(validation.email)}`)
                          }
                          className="btn btn-ghost btn-sm"
                        >
                          Revalidate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-[var(--border)]">
                <p className="text-sm text-[var(--text-muted)]">
                  Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
                  {pagination.total} results
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="btn btn-ghost btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 text-sm">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="btn btn-ghost btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
            <div className="w-16 h-16 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center mb-4">
              <Inbox className="w-8 h-8 text-[var(--text-muted)]" />
            </div>
            <p className="text-base font-medium mb-1">No validations found</p>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              {searchQuery || statusFilter
                ? "Try adjusting your filters or search query"
                : "Validated emails will appear here"}
            </p>
            {(searchQuery || statusFilter) && (
              <button onClick={() => router.replace("/history")} className="btn btn-ghost">
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
