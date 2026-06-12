"use client";

import { formatDistanceToNow } from "date-fns";
import { Inbox } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
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

  const [validations, setValidations] = useState<Validation[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  // Filters from URL
  const page = parseInt(searchParams.get("page") || "1");
  const statusFilter = searchParams.get("status") || "";
  const searchQuery = searchParams.get("search") || "";

  const fetchValidations = useCallback(async () => {
    setLoading(true);
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
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to fetch validations");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, searchQuery, pagination.limit]);

  useEffect(() => {
    fetchValidations();
  }, [fetchValidations]);

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const search = formData.get("search") as string;
    router.replace(`/history?search=${encodeURIComponent(search)}`);
  };

  const handleStatusFilter = (status: string) => {
    if (status) {
      router.replace(`/history?status=${status}`);
    } else {
      router.replace("/history");
    }
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", newPage.toString());
    router.replace(`/history?${params.toString()}`);
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold mb-2">Validation History</h1>
        <p className="text-[var(--text-secondary)]">View all your email validations</p>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1">
            <div className="flex gap-2">
              <input
                type="text"
                name="search"
                defaultValue={searchQuery}
                placeholder="Search by email..."
                className="input flex-1"
              />
              <button type="submit" className="btn btn-primary">
                Search
              </button>
            </div>
          </form>

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
                      className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)] transition-colors"
                    >
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
