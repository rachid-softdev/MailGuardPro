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
    bg: "var(--bg-subtle)",
    color: "var(--text-muted)",
    label: status,
  };

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono uppercase "
      style={{ backgroundColor: config.bg, color: config.color }}
    >
      {status === "success" && <CheckCircle className="w-3 h-3" />}
      {status === "failed" && <XCircle className="w-3 h-3" />}
      {status === "pending" && <Clock className="w-3 h-3" />}
      {config.label}
    </span>
  );
}

function DeliveryRow({
  delivery,
  isExpanded,
  onToggle,
}: {
  delivery: WebhookDelivery;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="border-b border-[var(--border)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
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
        <td className="py-3 px-4">
          <span className="inline-flex items-center gap-1.5 text-sm font-mono bg-[var(--bg-subtle)] px-2 py-0.5 rounded">
            {delivery.event}
          </span>
        </td>
        <td className="py-3 px-4 text-sm text-[var(--text-secondary)] font-mono max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap">
          <Tooltip content={delivery.url} side="top">
            <span>{truncateUrl(delivery.url)}</span>
          </Tooltip>
        </td>
        <td className="py-3 px-4">
          <StatusBadgeDelivery status={delivery.status} />
        </td>
        <td className="py-3 px-4 text-sm text-[var(--text-secondary)] font-mono">
          {delivery.statusCode ?? "—"}
        </td>
        <td className="py-3 px-4 text-sm text-[var(--text-secondary)] font-mono">
          {delivery.durationMs != null ? `${delivery.durationMs}ms` : "—"}
        </td>
        <td className="py-3 px-4 text-sm text-[var(--text-muted)] whitespace-nowrap">
          {formatDistanceToNow(new Date(delivery.createdAt), { addSuffix: true })}
        </td>
        <td className="py-3 px-4 text-[var(--text-muted)]">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-[var(--bg-elevated)]/50">
          <td colSpan={7} className="p-4 border-b border-[var(--border)]">
            <div className="space-y-4">
              {/* Error */}
              {delivery.error && (
                <div className="p-3 rounded-lg bg-[var(--status-invalid-bg)]/30 border border-[var(--status-invalid)]/20 text-sm text-[var(--status-invalid)]">
                  <span className="font-semibold">Error:</span> {delivery.error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {/* Request Body */}
                <div>
                  <h4 className="text-xs font-semibold uppercase  text-[var(--text-muted)] mb-2">
                    Request Body
                  </h4>
                  <pre className="text-xs font-mono bg-[var(--bg-subtle)] p-3 rounded-lg overflow-auto max-h-64 leading-relaxed">
                    {formatJson(delivery.requestBody)}
                  </pre>
                </div>

                {/* Response Body */}
                <div>
                  <h4 className="text-xs font-semibold uppercase  text-[var(--text-muted)] mb-2">
                    Response Body
                  </h4>
                  <pre className="text-xs font-mono bg-[var(--bg-subtle)] p-3 rounded-lg overflow-auto max-h-64 leading-relaxed">
                    {delivery.responseBody ? formatJson(delivery.responseBody) : "No response body"}
                  </pre>
                </div>
              </div>

              {/* Metadata */}
              <div className="flex gap-6 text-xs text-[var(--text-muted)] font-mono">
                <span>
                  ID: <span className="text-[var(--text-secondary)]">{delivery.id}</span>
                </span>
                {delivery.webhook?.name && (
                  <span>
                    Webhook:{" "}
                    <span className="text-[var(--text-secondary)]">{delivery.webhook.name}</span>
                  </span>
                )}
                <span>
                  Created:{" "}
                  <span className="text-[var(--text-secondary)]">
                    {new Date(delivery.createdAt).toLocaleString()}
                  </span>
                </span>
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

  const handleFilterChange = (setter: (v: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold mb-2">Webhook Deliveries</h1>
        <p className="text-[var(--text-secondary)]">
          View recent webhook delivery attempts and their payloads
        </p>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Webhook filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="filter-webhook" className="text-sm font-medium whitespace-nowrap">
              Webhook
            </label>
            <select
              id="filter-webhook"
              value={filterWebhookId}
              onChange={(e) => handleFilterChange(setFilterWebhookId, e.target.value)}
              className="input text-sm min-w-[180px]"
            >
              <option value="">All Webhooks</option>
              {webhooks.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="filter-status" className="text-sm font-medium whitespace-nowrap">
              Status
            </label>
            <select
              id="filter-status"
              value={filterStatus}
              onChange={(e) => handleFilterChange(setFilterStatus, e.target.value)}
              className="input text-sm min-w-[140px]"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {pagination && (
            <span className="text-xs text-[var(--text-muted)] ml-auto">
              {pagination.total} deliver{pagination.total === 1 ? "y" : "ies"}
            </span>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-[var(--status-invalid-bg)]/30 border border-[var(--status-invalid)]/20 text-sm text-[var(--status-invalid)] flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </span>
          <button
            onClick={handleRetry}
            className="btn btn-ghost btn-sm"
            aria-label="Retry loading deliveries"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Retry
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="card overflow-hidden">
          <div className="divide-y divide-[var(--border)]">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4 animate-skeleton">
                <div className="h-5 w-28 bg-[var(--bg-subtle)] rounded" />
                <div className="h-5 w-40 bg-[var(--bg-subtle)] rounded" />
                <div className="h-5 w-20 bg-[var(--bg-subtle)] rounded" />
                <div className="h-5 w-12 bg-[var(--bg-subtle)] rounded" />
                <div className="h-5 w-16 bg-[var(--bg-subtle)] rounded" />
                <div className="h-5 w-24 bg-[var(--bg-subtle)] rounded ml-auto" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && deliveries.length === 0 && (
        <div className="card text-center py-12">
          <div className="w-12 h-12 bg-[var(--bg-subtle)] rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-6 h-6 text-[var(--text-muted)]" />
          </div>
          <p className="text-[var(--text-secondary)] font-medium">No deliveries yet</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Deliveries will appear here when your webhooks receive events
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && deliveries.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)]/50">
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase  text-[var(--text-muted)]">
                    Event
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase  text-[var(--text-muted)]">
                    URL
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase  text-[var(--text-muted)]">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase  text-[var(--text-muted)]">
                    Code
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase  text-[var(--text-muted)]">
                    Duration
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase  text-[var(--text-muted)]">
                    When
                  </th>
                  <th className="py-3 px-4 w-10" />
                </tr>
              </thead>
              <tbody>
                {deliveries.map((delivery) => (
                  <DeliveryRow
                    key={delivery.id}
                    delivery={delivery}
                    isExpanded={expandedIds.has(delivery.id)}
                    onToggle={() => toggleExpanded(delivery.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-subtle)]/30">
              <span className="text-xs text-[var(--text-muted)]">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="btn btn-ghost btn-sm"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= (pagination.totalPages || 1)}
                  className="btn btn-ghost btn-sm"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
