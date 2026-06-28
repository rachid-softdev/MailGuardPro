"use client";

import { format, formatDistanceToNow } from "date-fns";
import {
  Calendar,
  CalendarClock,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Inbox,
  Loader2,
  Search,
  Trash2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
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
  const [confirmRevalidate, setConfirmRevalidate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Export state
  const [exportOpen, setExportOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);

  // Scheduled exports state
  const [scheduledExports, setScheduledExports] = useState<
    Array<{
      id: string;
      format: string;
      frequency: string;
      nextRunAt: string;
      createdAt: string;
    }>
  >([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [deletingSchedule, setDeletingSchedule] = useState<string | null>(null);

  // Extended filter state
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [scoreMin, setScoreMin] = useState("");
  const [scoreMax, setScoreMax] = useState("");
  const [domainFilter, setDomainFilter] = useState("");

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
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (scoreMin) params.set("scoreMin", scoreMin);
      if (scoreMax) params.set("scoreMax", scoreMax);
      if (domainFilter) params.set("domain", domainFilter);

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
    // pagination intentionally excluded (triggers via page change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    page,
    statusFilter,
    searchQuery,
    dateFrom,
    dateTo,
    scoreMin,
    scoreMax,
    domainFilter,
    pagination.limit,
  ]);

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

    setConfirmRevalidate(false);
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

  // Batch export selected validations
  const handleBatchExport = useCallback(async () => {
    const selected = validations.filter((v) => selection.selected.has(v.id));
    if (selected.length === 0) return;

    try {
      const body = { emails: selected.map((v) => v.email) };
      const res = await fetch("/api/v1/validations/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `mailguard-export-${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        setExportMessage("Batch export failed. Please try again.");
        setTimeout(() => setExportMessage(null), 5000);
      }
    } catch {
      setExportMessage("Batch export failed. Please try again.");
      setTimeout(() => setExportMessage(null), 5000);
    }
  }, [validations, selection.selected]);

  // Batch delete selected validations
  const handleBatchDelete = useCallback(async () => {
    const selected = validations.filter((v) => selection.selected.has(v.id));
    if (selected.length === 0) return;

    setDeleteLoading(true);
    setConfirmDelete(false);
    try {
      const ids = selected.map((v) => v.id);
      const res = await fetch("/api/v1/validations/batch-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        selection.clear();
        fetchValidations();
      } else {
        setBatchError("Failed to delete selected validations.");
        setTimeout(() => setBatchError(null), 5000);
      }
    } catch {
      setBatchError("Failed to delete selected validations.");
      setTimeout(() => setBatchError(null), 5000);
    } finally {
      setDeleteLoading(false);
    }
  }, [validations, selection, fetchValidations]);

  // Fetch scheduled exports
  const fetchScheduledExports = useCallback(async () => {
    setSchedulesLoading(true);
    try {
      const res = await fetch("/api/v1/exports");
      if (res.ok) {
        const data = await res.json();
        setScheduledExports(data.data || []);
      }
    } catch {
      logger.error({}, "Failed to fetch scheduled exports");
    } finally {
      setSchedulesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScheduledExports();
  }, [fetchScheduledExports]);

  // Close export dropdown on outside click or Escape key
  useEffect(() => {
    const handleInteraction = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") setExportOpen(false);
        return;
      }
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    if (exportOpen) {
      document.addEventListener("mousedown", handleInteraction);
      document.addEventListener("keydown", handleInteraction);
    }
    return () => {
      document.removeEventListener("mousedown", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
    };
  }, [exportOpen]);

  // Handle export
  const handleExport = useCallback(
    async (format: "csv" | "xlsx" | "pdf") => {
      setExportOpen(false);
      setExportLoading(true);
      setExportMessage(null);

      try {
        const params = new URLSearchParams();
        params.set("format", format);
        if (statusFilter) params.set("status", statusFilter);
        if (searchQuery) params.set("search", searchQuery);

        const body: Record<string, string | undefined> = {};
        if (statusFilter) body.status = statusFilter;
        if (searchQuery) body.search = searchQuery;

        const res = await fetch(`/api/v1/exports?${params.toString()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const msg = errData.error || `Export failed (${res.status})`;
          setExportMessage(msg);
          setTimeout(() => setExportMessage(null), 5000);
          return;
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `mailguard-export-${format}-${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Show "coming soon" message for xlsx/pdf
        if (format === "xlsx") {
          setExportMessage("XLSX export coming soon — CSV generated instead");
        } else if (format === "pdf") {
          setExportMessage("PDF export coming soon — CSV generated instead");
        }
        if (format !== "csv") {
          setTimeout(() => setExportMessage(null), 5000);
        }
      } catch {
        setExportMessage("Export failed. Please try again.");
        setTimeout(() => setExportMessage(null), 5000);
      } finally {
        setExportLoading(false);
      }
    },
    [statusFilter, searchQuery],
  );

  // Handle delete scheduled export
  const handleDeleteSchedule = useCallback(async (id: string) => {
    setDeletingSchedule(id);
    try {
      const res = await fetch(`/api/v1/exports/${id}`, { method: "DELETE" });
      if (res.ok) {
        setScheduledExports((prev) => prev.filter((s) => s.id !== id));
      }
    } catch {
      logger.error({}, "Failed to delete scheduled export");
    } finally {
      setDeletingSchedule(null);
    }
  }, []);

  // Clear selection when filters change (new page, new search, new status filter)
  // selection is stable, would cause loops
  useEffect(() => {
    selection.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, searchQuery]);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold mb-2">Validation History</h1>
        <p className="text-[var(--text-secondary)]">View all your email validations</p>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-col gap-4">
          {/* Row 1: Search + Status + Export */}
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

            <div className="flex gap-2 items-start">
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

              {/* Export button */}
              <div className="relative" ref={exportRef}>
                <button
                  onClick={() => setExportOpen((prev) => !prev)}
                  disabled={exportLoading}
                  className="btn btn-ghost btn-sm gap-1.5"
                  aria-haspopup="menu"
                  aria-expanded={exportOpen}
                  aria-controls="export-menu"
                >
                  {exportLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Export
                </button>

                {exportOpen && (
                  <div
                    id="export-menu"
                    role="menu"
                    className="animate-fade-slide-in absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] shadow-lg py-1"
                  >
                    <button
                      role="menuitem"
                      onClick={() => handleExport("csv")}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
                    >
                      <FileText className="w-4 h-4 text-[var(--text-muted)]" />
                      <span>Export as CSV</span>
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => handleExport("xlsx")}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-[var(--text-muted)]" />
                      <span>Export as XLSX</span>
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => handleExport("pdf")}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
                    >
                      <FileText className="w-4 h-4 text-[var(--text-muted)]" />
                      <span>Export as PDF</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Row 2: Extended filters */}
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <Filter className="w-3.5 h-3.5" />
              <span>Refine</span>
            </div>

            {/* Domain filter */}
            <input
              type="text"
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              placeholder="Filter by domain…"
              className="input flex-1 max-w-[180px] text-sm"
            />

            {/* Date range */}
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="input text-sm w-[140px]"
                aria-label="From date"
              />
              <span className="text-xs text-[var(--text-muted)]">—</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="input text-sm w-[140px]"
                aria-label="To date"
              />
            </div>

            {/* Score range */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">Score:</span>
              <input
                type="number"
                min={0}
                max={100}
                value={scoreMin}
                onChange={(e) => setScoreMin(e.target.value)}
                placeholder="Min"
                className="input text-sm w-[70px]"
                aria-label="Minimum score"
              />
              <span className="text-xs text-[var(--text-muted)]">—</span>
              <input
                type="number"
                min={0}
                max={100}
                value={scoreMax}
                onChange={(e) => setScoreMax(e.target.value)}
                placeholder="Max"
                className="input text-sm w-[70px]"
                aria-label="Maximum score"
              />
            </div>

            {/* Clear filters */}
            {(domainFilter || dateFrom || dateTo || scoreMin || scoreMax) && (
              <button
                onClick={() => {
                  setDomainFilter("");
                  setDateFrom("");
                  setDateTo("");
                  setScoreMin("");
                  setScoreMax("");
                }}
                className="text-xs text-[var(--accent)] hover:underline whitespace-nowrap"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error state */}
      {fetchError && (
        <div className="animate-fade-slide-in mb-4 px-4 py-3 rounded-lg bg-[var(--status-invalid)]/10 border border-[var(--status-invalid)]/30 text-sm text-[var(--status-invalid)] flex items-center justify-between">
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

      {/* Export notification */}
      {exportMessage && (
        <div className="animate-fade-slide-in mb-4 px-4 py-3 rounded-lg bg-[var(--accent-light)]/30 border border-[var(--accent)]/20 text-sm text-[var(--accent)] flex items-center justify-between">
          <span>{exportMessage}</span>
          <button
            onClick={() => setExportMessage(null)}
            className="text-xs font-medium underline hover:no-underline"
          >
            Dismiss
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
                    onClick={() => handleBatchExport()}
                    className="btn btn-ghost btn-sm gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export
                  </button>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="btn btn-ghost btn-sm gap-1.5 text-[var(--status-invalid)]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmRevalidate(true)}
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
              <Inbox className="w-8 h-8 text-[var(--text-muted)] animate-float-subtle" />
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

      {/* Scheduled Exports */}
      {scheduledExports.length > 0 && (
        <div className="card mt-6">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
            <CalendarClock className="w-4 h-4 text-[var(--text-muted)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Scheduled Exports</h2>
            {schedulesLoading && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-muted)]" />
            )}
          </div>
          <div className="divide-y divide-[var(--border)]">
            {scheduledExports.map((schedule) => (
              <div key={schedule.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  {schedule.format === "xlsx" ? (
                    <FileSpreadsheet className="w-4 h-4 text-[var(--text-muted)]" />
                  ) : (
                    <FileText className="w-4 h-4 text-[var(--text-muted)]" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {schedule.format.toUpperCase()} — {schedule.frequency}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Next run: {format(new Date(schedule.nextRunAt), "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteSchedule(schedule.id)}
                  disabled={deletingSchedule === schedule.id}
                  className="btn btn-ghost btn-sm text-[var(--status-invalid)] hover:bg-[var(--status-invalid)]/10"
                  aria-label="Delete scheduled export"
                >
                  {deletingSchedule === schedule.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Credit cost confirmation modal */}
      <Modal
        isOpen={confirmRevalidate}
        onClose={() => setConfirmRevalidate(false)}
        title="Confirm Batch Revalidation"
        size="sm"
      >
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Revalidating <strong>{selection.count}</strong> email{selection.count > 1 ? "s" : ""} will
          consume{" "}
          <strong>
            {selection.count} credit{selection.count > 1 ? "s" : ""}
          </strong>{" "}
          from your account. This action cannot be undone once processed.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setConfirmRevalidate(false)} className="btn btn-secondary btn-sm">
            Cancel
          </button>
          <button
            onClick={handleBatchRevalidate}
            disabled={batchValidating}
            className="btn btn-accent btn-sm"
          >
            Revalidate ({selection.count})
          </button>
        </div>
      </Modal>

      {/* Batch delete confirmation modal */}
      <Modal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete Selected Validations"
        size="sm"
      >
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Are you sure you want to delete <strong>{selection.count}</strong> validation
          {selection.count > 1 ? "s" : ""}? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setConfirmDelete(false)} className="btn btn-secondary btn-sm">
            Cancel
          </button>
          <button
            onClick={handleBatchDelete}
            disabled={deleteLoading}
            className="btn btn-danger btn-sm"
          >
            {deleteLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Deleting...
              </>
            ) : (
              `Delete (${selection.count})`
            )}
          </button>
        </div>
      </Modal>
    </div>
  );
}
