"use client";

import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button, Card } from "@/components/ui";
import { Tooltip } from "@/components/ui/Tooltip";
import { logger } from "@/lib/logger";

// ── Types ────────────────────────────────────────────────────────────────────

interface WebhookOption {
  id: string;
  name: string;
}

interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  url: string;
  status: string;
  statusCode: number | null;
  requestBody: unknown;
  responseBody: string | null;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
  webhook: { name: string } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "Pending" },
];

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  success: {
    bg: "var(--status-valid-bg)",
    color: "var(--status-valid)",
    label: "Success",
  },
  failed: {
    bg: "var(--status-invalid-bg)",
    color: "var(--status-invalid)",
    label: "Failed",
  },
  pending: {
    bg: "var(--status-unknown-bg)",
    color: "var(--status-unknown)",
    label: "Pending",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatJson(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function truncateUrl(url: string, max = 50): string {
  if (url.length <= max) return url;
  return url.substring(0, max) + "…";
}

function StatusBadgeDelivery({ status }: { status: string }) {
  const config = STATUS_STYLES[status] ?? {
    bg: "var(--surface-2)",
    color: "var(--ink-3)",
    label: status,
  };

  return (
    <span
      className="inline-flex items-center gap-1 border border-current px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em]"
      style={{ backgroundColor: config.bg, color: config.color }}
    >
      {status === "success" && <CheckCircle className="h-3 w-3" aria-hidden="true" />}
      {status === "failed" && <XCircle className="h-3 w-3" aria-hidden="true" />}
      {status === "pending" && <Clock className="h-3 w-3" aria-hidden="true" />}
      {config.label}
    </span>
  );
}

function DeliveryRow({
  delivery,
  isExpanded,
  onToggle,
  onRedeliver,
  isRetrying,
}: {
  delivery: WebhookDelivery;
  isExpanded: boolean;
  onToggle: () => void;
  onRedeliver: (id: string) => void;
  isRetrying: boolean;
}) {
  return (
    <>
      <tr
        className="cursor-pointer transition-colors hover:bg-[var(--surface-2)]"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={isExpanded}
      >
        <td>
          <span className="inline-flex items-center gap-1.5 bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-2)]">
            {delivery.event}
          </span>
        </td>
        <td className="max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-[var(--ink-2)]">
          <Tooltip content={delivery.url} side="top">
            <span>{truncateUrl(delivery.url)}</span>
          </Tooltip>
        </td>
        <td>
          <StatusBadgeDelivery status={delivery.status} />
        </td>
        <td className="font-mono text-[11px] text-[var(--ink-2)]">{delivery.statusCode ?? "—"}</td>
        <td className="font-mono text-[11px] text-[var(--ink-2)]">
          {delivery.durationMs != null ? `${delivery.durationMs}ms` : "—"}
        </td>
        <td className="whitespace-nowrap text-[11px] text-[var(--ink-3)]">
          {formatDistanceToNow(new Date(delivery.createdAt), { addSuffix: true })}
        </td>
        <td className="text-[var(--ink-3)]">
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-[var(--surface-2)]/50">
          <td colSpan={7} className="border-b border-[var(--line)] p-4">
            <div className="space-y-3">
              {/* Error */}
              {delivery.error && (
                <div className="border border-[var(--status-invalid)]/40 bg-[var(--status-invalid-bg)]/40 px-3 py-2 text-[12px] text-[var(--status-invalid-text)]">
                  <span className="font-mono text-[10px] uppercase tracking-[0.05em]">Error</span>
                  <span className="ml-2">{delivery.error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {/* Request Body */}
                <div>
                  <h4 className="label-mono mb-1.5">Request body</h4>
                  <pre className="max-h-64 overflow-auto border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-[11px] leading-relaxed text-[var(--ink-2)]">
                    {formatJson(delivery.requestBody)}
                  </pre>
                </div>

                {/* Response Body */}
                <div>
                  <h4 className="label-mono mb-1.5">Response body</h4>
                  <pre className="max-h-64 overflow-auto border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-[11px] leading-relaxed text-[var(--ink-2)]">
                    {delivery.responseBody ? formatJson(delivery.responseBody) : "No response body"}
                  </pre>
                </div>
              </div>

              {/* Metadata */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] text-[var(--ink-3)]">
                <span>
                  ID <span className="text-[var(--ink-2)]">{delivery.id}</span>
                </span>
                {delivery.webhook?.name && (
                  <span>
                    Webhook <span className="text-[var(--ink-2)]">{delivery.webhook.name}</span>
                  </span>
                )}
                <span>
                  Created{" "}
                  <span className="text-[var(--ink-2)]">
                    {new Date(delivery.createdAt).toLocaleString()}
                  </span>
                </span>
                {delivery.status === "failed" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() => onRedeliver(delivery.id)}
                    loading={isRetrying}
                    aria-label={`Retry delivery ${delivery.id}`}
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Retry delivery
                  </Button>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Page Component ────────────────────────────────────────────────────────────

export default function WebhookDeliveriesPage() {
  // Data
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookOption[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterWebhookId, setFilterWebhookId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);

  // Expanded rows
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Manual redelivery
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryFeedback, setRetryFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  // ── Fetch webhooks for dropdown ─────────────────────────────────────────

  const fetchWebhooks = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/webhooks");
      if (res.ok) {
        const data = await res.json();
        setWebhooks(data.data || []);
      }
    } catch (err) {
      logger.error({ err }, "Failed to fetch webhooks for filter");
    }
  }, []);

  // ── Fetch deliveries ────────────────────────────────────────────────────

  const fetchDeliveries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterWebhookId) params.set("webhookId", filterWebhookId);
      if (filterStatus) params.set("status", filterStatus);
      params.set("page", String(page));
      params.set("limit", "20");

      const res = await fetch(`/api/v1/webhooks/deliveries?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setDeliveries(json.data || []);
        setPagination(json.pagination || null);
      } else {
        setError("Failed to load deliveries. Please try again.");
      }
    } catch {
      setError("Could not connect to the server. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, [filterWebhookId, filterStatus, page]);

  // ── Effects ─────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRetry = () => {
    fetchDeliveries();
  };

  // Re-send a failed delivery as a new attempt (single immediate try server-side)
  const handleRedeliver = async (id: string) => {
    setRetryingId(id);
    setRetryFeedback(null);
    try {
      const res = await fetch(`/api/v1/webhooks/deliveries/${id}/retry`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setRetryFeedback({
          ok: true,
          message: json.message || "Delivery re-sent — the result was added to the history.",
        });
        await fetchDeliveries();
      } else {
        setRetryFeedback({
          ok: false,
          message: json?.error || "Redelivery failed. Please try again.",
        });
      }
    } catch {
      setRetryFeedback({
        ok: false,
        message: "Could not connect to the server. Please check your connection.",
      });
    } finally {
      setRetryingId(null);
    }
  };

  const handleFilterChange = (setter: (v: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          eyebrow="Developer / delivery log"
          title="Webhook Deliveries."
          description="Every attempt, its payload, and the response that came back. Expand a row to inspect the exchange."
          actions={
            <Button onClick={handleRetry} variant="ghost" size="sm" aria-label="Refresh deliveries">
              <RefreshCw size={13} aria-hidden="true" />
              Refresh
            </Button>
          }
          meta={
            <>
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                {pagination ? `${pagination.total.toLocaleString()} attempts` : "Loading…"}
              </span>
              <span className="h-3 w-px bg-[var(--line)]" aria-hidden="true" />
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                Retry window / 5 attempts
              </span>
            </>
          }
        />

        {/* Filters */}
        <Card variant="default" padding="sm" className="mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor="filter-webhook"
                className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]"
              >
                Webhook
              </label>
              <select
                id="filter-webhook"
                value={filterWebhookId}
                onChange={(e) => handleFilterChange(setFilterWebhookId, e.target.value)}
                className="input min-w-[180px]"
              >
                <option value="">All Webhooks</option>
                {webhooks.map((wh) => (
                  <option key={wh.id} value={wh.id}>
                    {wh.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="filter-status"
                className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]"
              >
                Status
              </label>
              <select
                id="filter-status"
                value={filterStatus}
                onChange={(e) => handleFilterChange(setFilterStatus, e.target.value)}
                className="input min-w-[140px]"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {pagination && (
              <span className="ml-auto pb-2 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                {pagination.total} deliver{pagination.total === 1 ? "y" : "ies"}
              </span>
            )}
          </div>
        </Card>

        {/* Redelivery feedback */}
        {retryFeedback && (
          <div
            role="status"
            className={`mb-4 flex items-center gap-2 border px-4 py-3 text-[13px] ${
              retryFeedback.ok
                ? "border-[var(--status-valid)] bg-[var(--status-valid-bg)] text-[var(--status-valid-text)]"
                : "border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] text-[var(--status-invalid-text)]"
            }`}
          >
            {retryFeedback.ok ? (
              <CheckCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            {retryFeedback.message}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="mb-4 flex items-center justify-between border border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] px-4 py-3 text-[13px] text-[var(--status-invalid-text)]">
            <span className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              {error}
            </span>
            <Button
              onClick={handleRetry}
              variant="ghost"
              size="sm"
              aria-label="Retry loading deliveries"
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <Card variant="default" padding="md" className="overflow-hidden">
            <div className="divide-y divide-[var(--line)]">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4">
                  <div className="h-4 w-28 animate-skeleton bg-[var(--surface-3)]" />
                  <div className="h-4 w-40 animate-skeleton bg-[var(--surface-3)]" />
                  <div className="h-4 w-20 animate-skeleton bg-[var(--surface-3)]" />
                  <div className="h-4 w-12 animate-skeleton bg-[var(--surface-3)]" />
                  <div className="h-4 w-16 animate-skeleton bg-[var(--surface-3)]" />
                  <div className="ml-auto h-4 w-24 animate-skeleton bg-[var(--surface-3)]" />
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Empty state */}
        {!loading && !error && deliveries.length === 0 && (
          <Card variant="default" padding="md" className="py-12 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center border border-[var(--line)] bg-[var(--surface-2)]">
              <Clock className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-medium text-[var(--ink)]">No deliveries yet</p>
            <p className="mt-1 text-[12px] text-[var(--ink-3)]">
              Attempts appear here once a webhook receives an event.
            </p>
          </Card>
        )}

        {/* Table */}
        {!loading && !error && deliveries.length > 0 && (
          <Card variant="default" padding="md" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>URL</th>
                    <th>Status</th>
                    <th>Code</th>
                    <th>Duration</th>
                    <th>When</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((delivery) => (
                    <DeliveryRow
                      key={delivery.id}
                      delivery={delivery}
                      isExpanded={expandedIds.has(delivery.id)}
                      onToggle={() => toggleExpanded(delivery.id)}
                      onRedeliver={handleRedeliver}
                      isRetrying={retryingId === delivery.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-[var(--line)] bg-[var(--surface-2)]/30 px-4 py-3">
                <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    variant="ghost"
                    size="sm"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= (pagination.totalPages || 1)}
                    variant="ghost"
                    size="sm"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
