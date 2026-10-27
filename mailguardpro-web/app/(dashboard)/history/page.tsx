"use client";

import { formatDistanceToNow } from "date-fns";
import { Calendar, Download, FileText, Filter, Inbox, Loader2, Search, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ScoreMeter } from "@/components/validator/ScoreGauge";
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Export state
  const [exportOpen, setExportOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);

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
        setValidations([]);
        setFetchError("Failed to load validations. Please try again.");
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to fetch validations");
      setValidations([]);
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

  // Batch export selected validations
  const handleBatchExport = useCallback(async () => {
    const selected = validations.filter((v) => selection.selected.has(v.id));
    if (selected.length === 0) return;

    try {
      const body = { ids: selected.map((v) => v.id) };
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

  // Handle CSV export. XLSX/PDF are available from a completed bulk job.
  const handleExport = useCallback(async () => {
    setExportOpen(false);
    setExportLoading(true);
    setExportMessage(null);

    try {
      const params = new URLSearchParams();
      params.set("format", "csv");
      if (statusFilter) params.set("status", statusFilter);
      if (searchQuery) params.set("search", searchQuery);

      const body: Record<string, string | undefined> = {};
      if (statusFilter) body.status = statusFilter;
      if (searchQuery) body.search = searchQuery;
      if (dateFrom) body.dateFrom = dateFrom;
      if (dateTo) body.dateTo = dateTo;
      if (scoreMin) body.scoreMin = scoreMin;
      if (scoreMax) body.scoreMax = scoreMax;
      if (domainFilter) body.domain = domainFilter;

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

      const truncated = res.headers.get("X-Export-Truncated") === "true";
      if (truncated) {
        setExportMessage("Export capped at 10,000 rows. Narrow the filters for a complete file.");
        setTimeout(() => setExportMessage(null), 8000);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mailguard-export${truncated ? "-truncated" : ""}-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setExportMessage("Export failed. Please try again.");
      setTimeout(() => setExportMessage(null), 5000);
    } finally {
      setExportLoading(false);
    }
  }, [statusFilter, searchQuery, dateFrom, dateTo, scoreMin, scoreMax, domainFilter]);

  // Clear selection when any filter changes. Selection is stable, so it is
  // intentionally omitted from the dependency list.
  useEffect(() => {
    selection.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, searchQuery, dateFrom, dateTo, scoreMin, scoreMax, domainFilter]);

  // A failed fetch can leave old rows on screen; drop any selection so batch
  // actions cannot act on rows that are no longer part of the current view.
  useEffect(() => {
    if (fetchError) selection.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchError]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          eyebrow="Register / validation history"
          title="Every verdict, on file."
          description="Search the register, refine by domain or score, and act on a selection without leaving the page."
          actions={
            <>
              <Button href="/validate" variant="primary" size="sm">
                Validate one
              </Button>
              <div className="relative" ref={exportRef}>
                <Button
                  onClick={() => setExportOpen((prev) => !prev)}
                  disabled={exportLoading}
                  variant="ghost"
                  size="sm"
                  aria-haspopup="menu"
                  aria-expanded={exportOpen}
                  aria-controls="export-menu"
                >
                  {exportLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Export
                </Button>

                {exportOpen && (
                  <div
                    id="export-menu"
                    role="menu"
                    className="absolute right-0 top-full z-50 mt-1 w-52 border border-[var(--line-strong)] bg-[var(--surface)] py-1"
                  >
                    <button
                      role="menuitem"
                      onClick={handleExport}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
                    >
                      <FileText className="h-3.5 w-3.5 text-[var(--ink-3)]" aria-hidden="true" />
                      Export as CSV
                    </button>
                    <p className="px-3 pb-2 pt-1 text-[10px] leading-relaxed text-[var(--ink-3)]">
                      XLSX and PDF are available from a completed bulk job.
                    </p>
                  </div>
                )}
              </div>
            </>
          }
          meta={
            <>
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                {pagination.total.toLocaleString()} records
              </span>
              <span className="h-3 w-px bg-[var(--line)]" aria-hidden="true" />
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                Page {pagination.page} of {Math.max(1, pagination.totalPages)}
              </span>
              {selection.count > 0 && (
                <>
                  <span className="h-3 w-px bg-[var(--line)]" aria-hidden="true" />
                  <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--accent-text)]">
                    {selection.count} selected
                  </span>
                </>
              )}
            </>
          }
        />

        {fetchError && (
          <div
            role="alert"
            className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] px-4 py-3 text-[13px] text-[var(--status-invalid-text)]"
          >
            <span>{fetchError}</span>
            <button
              onClick={() => {
                setFetchError(null);
                fetchValidations();
              }}
              className="font-mono text-[10px] uppercase tracking-[0.04em] underline"
            >
              Retry
            </button>
          </div>
        )}

        {exportMessage && (
          <div
            role="status"
            className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-3 text-[13px] text-[var(--ink-2)]"
          >
            <span>{exportMessage}</span>
            <button
              onClick={() => setExportMessage(null)}
              className="font-mono text-[10px] uppercase tracking-[0.04em] text-[var(--ink-3)] underline"
            >
              Dismiss
            </button>
          </div>
        )}

        <section className="mb-5 border border-[var(--line-strong)] bg-[var(--surface)]">
          <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-4 py-2.5">
            <p className="label-mono flex items-center gap-2">
              <span className="h-1.5 w-1.5 bg-[var(--accent)]" aria-hidden="true" />
              Filters / ledger
            </p>
            <p className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
              {loading ? "Reading…" : `${pagination.total.toLocaleString()} records`}
            </p>
          </div>

          <div className="p-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-3)]"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  placeholder="Search by email…"
                  aria-label="Search validations by email"
                  className="input w-full pl-9"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => handleStatusFilter(e.target.value)}
                aria-label="Filter by status"
                className="input sm:w-40"
              >
                <option value="">All Status</option>
                <option value="valid">Valid</option>
                <option value="invalid">Invalid</option>
                <option value="risky">Risky</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--line)] pt-3">
              <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                <Filter className="h-3 w-3" aria-hidden="true" />
                Refine
              </span>

              <input
                type="text"
                value={domainFilter}
                onChange={(e) => setDomainFilter(e.target.value)}
                placeholder="Domain…"
                aria-label="Filter by domain"
                className="input w-[150px]"
              />

              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-[var(--ink-3)]" aria-hidden="true" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="input w-[135px]"
                  aria-label="From date"
                />
                <span className="font-mono text-[10px] text-[var(--ink-3)]">—</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="input w-[135px]"
                  aria-label="To date"
                />
              </span>

              <span className="flex items-center gap-1.5">
                <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                  Score
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={scoreMin}
                  onChange={(e) => setScoreMin(e.target.value)}
                  placeholder="Min"
                  aria-label="Minimum score"
                  className="input w-[64px]"
                />
                <span className="font-mono text-[10px] text-[var(--ink-3)]">—</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={scoreMax}
                  onChange={(e) => setScoreMax(e.target.value)}
                  placeholder="Max"
                  aria-label="Maximum score"
                  className="input w-[64px]"
                />
              </span>

              {(domainFilter || dateFrom || dateTo || scoreMin || scoreMax) && (
                <button
                  onClick={() => {
                    setDomainFilter("");
                    setDateFrom("");
                    setDateTo("");
                    setScoreMin("");
                    setScoreMax("");
                  }}
                  className="font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--accent-text)] hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
            <div>
              <p className="label-mono">Register</p>
              <h2 className="mt-1 font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                Validations
              </h2>
              <p className="mt-1 max-w-[52ch] text-[11px] leading-relaxed text-[var(--ink-3)]">
                Single validations are masked for privacy. Completed bulk jobs keep the original
                addresses for export.
              </p>
            </div>
            <p className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
              {loading ? "Loading…" : `${pagination.total.toLocaleString()} total`}
            </p>
          </div>

          {selection.count > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--accent-soft)] px-4 py-2.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--accent-text)]">
                {selection.count} selected
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={selection.clear}
                  className="px-2 py-1 font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--ink-2)] hover:text-[var(--ink)]"
                >
                  Deselect all
                </button>
                <Button
                  onClick={() => handleBatchExport()}
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Export
                </Button>
                <Button
                  onClick={() => setConfirmDelete(true)}
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-[var(--status-invalid-text)]"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Delete
                </Button>
              </div>
            </div>
          )}

          {batchError && (
            <div className="border-b border-[var(--line)] bg-[var(--status-invalid-bg)] px-4 py-2 text-[12px] text-[var(--status-invalid-text)]">
              {batchError}
            </div>
          )}

          {loading ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-8" scope="col">
                      <span className="sr-only">Select</span>
                    </th>
                    <th scope="col">Email</th>
                    <th scope="col">Score</th>
                    <th scope="col">Status</th>
                    <th scope="col">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4].map((i) => (
                    <tr key={i}>
                      <td>
                        <div className="h-3.5 w-3.5 animate-skeleton" />
                      </td>
                      <td>
                        <div className="h-3 w-48 animate-skeleton" />
                      </td>
                      <td>
                        <div className="h-3 w-16 animate-skeleton" />
                      </td>
                      <td>
                        <div className="h-4 w-16 animate-skeleton" />
                      </td>
                      <td>
                        <div className="h-3 w-24 animate-skeleton" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : validations.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="w-8" scope="col">
                        <input
                          type="checkbox"
                          checked={
                            selection.allSelected(validations.map((v) => v.id)) &&
                            validations.length > 0
                          }
                          onChange={() => selection.toggleAll(validations.map((v) => v.id))}
                          className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
                          aria-label="Select all validations"
                        />
                      </th>
                      <th scope="col">Email</th>
                      <th scope="col">Score</th>
                      <th scope="col">Status</th>
                      <th scope="col">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validations.map((validation) => (
                      <tr
                        key={validation.id}
                        className={
                          selection.isSelected(validation.id)
                            ? "bg-[var(--accent-soft)]"
                            : undefined
                        }
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={selection.isSelected(validation.id)}
                            onChange={() => selection.toggle(validation.id)}
                            className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
                            aria-label={`Select ${validation.email}`}
                          />
                        </td>
                        <td>
                          <span className="font-mono text-[12px] text-[var(--ink)]">
                            {validation.email}
                          </span>
                        </td>
                        <td>
                          <ScoreMeter score={validation.score} />
                        </td>
                        <td>
                          <StatusBadge
                            status={validation.status as "valid" | "invalid" | "risky" | "unknown"}
                          />
                        </td>
                        <td>
                          <span className="font-mono text-[10px] text-[var(--ink-3)]">
                            {formatDistanceToNow(new Date(validation.createdAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {pagination.totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3">
                  <p className="font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
                    Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                    {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
                    {pagination.total} results
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page <= 1}
                      variant="ghost"
                      size="sm"
                    >
                      Previous
                    </Button>
                    <span className="font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
                      {pagination.page} / {pagination.totalPages}
                    </span>
                    <Button
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page >= pagination.totalPages}
                      variant="ghost"
                      size="sm"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <span className="flex h-10 w-10 items-center justify-center border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-3)]">
                <Inbox className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="mt-3 text-sm font-medium text-[var(--ink)]">No validations found</p>
              <p className="mt-1 max-w-[38ch] text-[12px] leading-relaxed text-[var(--ink-3)]">
                {searchQuery || statusFilter
                  ? "Try adjusting your filters or search query."
                  : "Validated emails will appear here once the line has run."}
              </p>
              {(searchQuery || statusFilter) && (
                <Button onClick={() => router.replace("/history")} variant="ghost" className="mt-4">
                  Clear filters
                </Button>
              )}
            </div>
          )}
        </section>
      </div>

      <Modal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete Selected Validations"
        size="sm"
      >
        <p className="mb-4 text-sm leading-relaxed text-[var(--ink-2)]">
          Are you sure you want to delete <strong>{selection.count}</strong> validation
          {selection.count > 1 ? "s" : ""}? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setConfirmDelete(false)} variant="secondary" size="sm">
            Cancel
          </Button>
          <Button onClick={handleBatchDelete} disabled={deleteLoading} variant="danger" size="sm">
            {deleteLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Deleting…
              </>
            ) : (
              `Delete (${selection.count})`
            )}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
