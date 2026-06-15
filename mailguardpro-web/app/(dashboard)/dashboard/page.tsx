"use client";

import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Clock,
  Layers,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardErrorState } from "@/components/dashboard/DashboardErrorState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { QuickValidate } from "@/components/dashboard/QuickValidate";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { usePolling } from "@/hooks/usePolling";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardUser {
  name: string | null;
  email: string | null;
  plan: string;
  creditsRemaining: number;
}

interface DashboardStats {
  thisMonth: number;
  avgScore: number;
  validRate: number;
  totalValidated: number;
}

interface DayData {
  date: string;
  count: number;
  avgScore: number;
}

interface StatusData {
  status: string;
  count: number;
}

interface ScoreDist {
  range: string;
  count: number;
}

interface ActivityItem {
  action: string;
  email: string;
  score: number;
  status: string;
  time: string;
}

interface Trends {
  todayCount: number;
  yesterdayCount: number;
  weekAvg: number;
  monthAvg: number;
}

interface JobItem {
  id: string;
  filename: string;
  status: string;
  totalEmails: number;
  processed: number;
  createdAt: string;
}

interface DashboardData {
  user: DashboardUser;
  stats: DashboardStats;
  validationsByDay: DayData[];
  validationsByStatus: StatusData[];
  scoreDistribution: ScoreDist[];
  recentActivity: ActivityItem[];
  trends: Trends;
  recentJobs: JobItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const maskedLocal = local.length > 0 ? local[0] + "***" : "***";
  const parts = domain.split(".");
  const maskedDomain = parts[0]?.[0] ? parts[0][0] + "***." + parts.slice(1).join(".") : "***";
  return `${maskedLocal}@${maskedDomain}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ValidationByDayChart({ data }: { data: DayData[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase  text-[var(--text-muted)]">
          Validations by Day
        </h3>
        <BarChart3 className="w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
      </div>
      <div
        className="flex items-end gap-2 h-32 sm:h-48"
        role="img"
        aria-label={`Bar chart: email validations per day. ${data.map((d) => `${d.date}: ${d.count} (avg score ${d.avgScore})`).join(", ")}`}
      >
        {data.map((day) => {
          const height = Math.max((day.count / maxCount) * 180, day.count > 0 ? 8 : 0);
          const date = new Date(day.date + "T00:00:00");
          const dayLabel = date.toLocaleDateString("en-US", { weekday: "short" });
          const fullLabel = date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });

          return (
            <div
              key={day.date}
              className="flex-1 flex flex-col items-center gap-1 min-w-0"
              title={`${fullLabel}: ${day.count} validations, avg score ${day.avgScore}`}
              aria-hidden="true"
            >
              <span className="text-[11px] font-mono text-[var(--text-muted)] leading-none">
                {day.count}
              </span>
              <div
                className="w-full rounded-t transition-all duration-300"
                style={{
                  height: `${height}px`,
                  backgroundColor:
                    day.avgScore >= 80
                      ? "var(--status-valid)"
                      : day.avgScore >= 60
                        ? "var(--score-medium)"
                        : day.avgScore > 0
                          ? "var(--status-invalid)"
                          : "var(--bg-subtle)",
                  opacity: day.count > 0 ? 1 : 0.4,
                }}
              />
              <span className="text-[11px] text-[var(--text-muted)] truncate w-full text-center">
                {dayLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusDistribution({ data }: { data: StatusData[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) return null;

  const statusColors: Record<string, string> = {
    valid: "var(--status-valid)",
    invalid: "var(--status-invalid)",
    risky: "var(--status-risky)",
    unknown: "var(--status-unknown)",
  };

  const statusOrder = ["valid", "invalid", "risky", "unknown"];
  const sorted = [...data].sort(
    (a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status),
  );

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase  text-[var(--text-muted)]">
          Validations by Status
        </h3>
        <Layers className="w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
      </div>
      {/* Stacked bar */}
      <div
        className="flex h-5 rounded-full overflow-hidden mb-3"
        role="img"
        aria-label={`Status distribution: ${sorted.map((s) => `${s.status}: ${s.count} (${Math.round((s.count / total) * 100)}%)`).join(", ")}`}
      >
        {sorted.map((item) => (
          <div
            key={item.status}
            style={{
              width: `${(item.count / total) * 100}%`,
              backgroundColor: statusColors[item.status] || "var(--bg-subtle)",
            }}
            title={`${item.status}: ${item.count} (${Math.round((item.count / total) * 100)}%)`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="space-y-1.5">
        {sorted.map((item) => {
          const pct = Math.round((item.count / total) * 100);
          return (
            <div key={item.status} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: statusColors[item.status] || "var(--bg-subtle)",
                  }}
                />
                <span className="capitalize text-[var(--text-secondary)]">{item.status}</span>
              </div>
              <span className="font-mono text-xs">
                {item.count} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScoreDistributionChart({ data }: { data: ScoreDist[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const allZero = data.every((d) => d.count === 0);

  const rangeColors = [
    "var(--score-critical)",
    "var(--score-poor)",
    "var(--score-medium)",
    "var(--score-good)",
    "var(--score-excellent)",
  ];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase  text-[var(--text-muted)]">
          Score Distribution
        </h3>
        <Activity className="w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
      </div>
      {allZero ? (
        <p className="text-sm text-[var(--text-muted)] text-center py-4">No data yet</p>
      ) : (
        <div
          className="space-y-3"
          role="img"
          aria-label={`Score distribution: ${data.map((d) => `${d.range}: ${d.count}`).join(", ")}`}
        >
          {data.map((item, i) => (
            <div key={item.range}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-[var(--text-muted)]">{item.range}</span>
                <span className="font-mono text-xs">{item.count}</span>
              </div>
              <div className="w-full h-2.5 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${(item.count / maxCount) * 100}%`,
                    backgroundColor: rangeColors[i],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentActivityFeed({ activities }: { activities: ActivityItem[] }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase  text-[var(--text-muted)]">
          Recent Activity
        </h3>
        <Clock className="w-4 h-4 text-[var(--text-muted)]" />
      </div>
      {activities.length > 0 ? (
        <div className="space-y-1 max-h-80 overflow-y-auto pr-1 -mr-1">
          {activities.map((activity, i) => (
            <div
              key={`${activity.email}-${i}`}
              className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0"
            >
              <div className="flex-1 min-w-0">
                <p className="font-mono text-sm truncate">{maskEmail(activity.email)}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {formatDistanceToNow(new Date(activity.time), {
                    addSuffix: true,
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-3 shrink-0">
                <span className="text-sm font-bold">{activity.score}</span>
                <StatusBadge
                  status={activity.status as "valid" | "invalid" | "risky" | "unknown"}
                  showDot={false}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center py-8 text-[var(--text-muted)]">
          <Activity className="w-10 h-10 mb-3 opacity-50 animate-float-subtle" />
          <p className="text-sm">No activity yet</p>
          <p className="text-xs mt-1">Start validating emails to see activity here</p>
        </div>
      )}
    </div>
  );
}

// Skeleton and ErrorState extracted to components/dashboard/

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobsOpen, setJobsOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [ticker, setTicker] = useState(0);

  // Tick every 10s to keep relative timestamps fresh
  useEffect(() => {
    const interval = setInterval(() => setTicker((t) => t + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

  // Fetcher used by both initial load and polling
  const fetchData = useCallback(async (): Promise<DashboardData> => {
    const res = await fetch("/api/v1/dashboard/stats");
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to fetch");
    return json.data as DashboardData;
  }, []);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchData()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLastUpdated(new Date());
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchData]);

  // Auto-refresh every 30s (only after initial data is loaded)
  usePolling({
    fetcher: async () => {
      const result = await fetchData();
      setData(result);
      setLastUpdated(new Date());
      setError(null);
      return result;
    },
    shouldStop: () => false,
    interval: 30_000,
    enabled: !loading && data !== null,
    onError: () => {
      // Silently keep existing data on auto-refresh errors
    },
  });

  // ---- Loading state ----
  if (loading && !data) {
    return <DashboardSkeleton />;
  }

  // ---- Error state ----
  if (error && !data) {
    return (
      <DashboardErrorState
        message={error}
        onRetry={() => {
          setLoading(true);
          setError(null);
          fetchData()
            .then((result) => {
              setData(result);
              setLastUpdated(new Date());
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setLoading(false));
        }}
      />
    );
  }

  // ---- Safe fallback when data is unexpectedly null ----
  if (!data) {
    return <DashboardSkeleton />;
  }

  const {
    user,
    stats,
    trends,
    validationsByDay,
    validationsByStatus,
    scoreDistribution,
    recentActivity,
    recentJobs,
  } = data;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold mb-2">Dashboard</h1>
            <p className="text-[var(--text-secondary)]">
              Welcome back, {user?.name || user?.email || "User"}
            </p>
          </div>
          {/* Last updated indicator */}
          {lastUpdated && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <RefreshCw className="w-3 h-3" />
              <span suppressHydrationWarning key={ticker}>
                Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
              </span>
            </div>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <span className="badge badge-accent">{user?.plan}</span>
          <span className="text-sm text-[var(--text-muted)]">
            {user?.creditsRemaining} credits remaining
          </span>
        </div>
        {/* Mobile last updated */}
        {lastUpdated && (
          <div className="sm:hidden mt-2 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <RefreshCw className="w-3 h-3" />
            <span suppressHydrationWarning key={ticker}>
              Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
            </span>
          </div>
        )}
      </div>

      {/* Quick Validate */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-display font-semibold">Quick Validate</h2>
          <div className="flex items-center gap-2">
            <Link href="/validate" className="btn btn-accent btn-sm">
              Full Validator
            </Link>
            <Link href="/bulk" className="btn btn-primary btn-sm">
              Bulk Upload
            </Link>
          </div>
        </div>
        <QuickValidate />
      </div>

      {/* ---- KPI Cards (merged with trend data) ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div
          className="card animate-fade-slide-up"
          style={{ "--i": 0, backgroundColor: "var(--accent-light)" } as React.CSSProperties}
          title="Total validations performed this month. Resets on the 1st of each month."
        >
          <p className="text-xs text-[var(--text-muted)] mb-1">This Month</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-display font-bold">{stats.thisMonth}</p>
            <span className="text-xs text-[var(--status-valid)] flex items-center gap-0.5">
              <TrendingUp className="w-3 h-3" />
              {trends.todayCount} today
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">validations this month</p>
        </div>

        <div
          className="card animate-fade-slide-up"
          style={{ "--i": 1 } as React.CSSProperties}
          title="Average quality score across all validations. 80+ is highly deliverable."
        >
          <div className="flex items-start justify-between mb-1">
            <p className="text-xs text-[var(--text-muted)]">Avg Score</p>
            <span
              className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${
                stats.avgScore >= 80
                  ? "text-[var(--status-valid)] bg-[var(--status-valid)]/10"
                  : stats.avgScore >= 60
                    ? "text-[var(--score-medium)] bg-[var(--score-medium)]/10"
                    : "text-[var(--status-invalid)] bg-[var(--status-invalid)]/10"
              }`}
            >
              {stats.avgScore >= 80 ? "Good" : stats.avgScore >= 60 ? "Fair" : "Poor"}
            </span>
          </div>
          <p className="text-3xl font-display font-bold">{stats.avgScore}</p>
          <div className="mt-2 w-full h-1.5 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${stats.avgScore}%`,
                backgroundColor:
                  stats.avgScore >= 80
                    ? "var(--status-valid)"
                    : stats.avgScore >= 60
                      ? "var(--score-medium)"
                      : "var(--status-invalid)",
              }}
            />
          </div>
        </div>

        <div className="card animate-fade-slide-up" style={{ "--i": 2 } as React.CSSProperties}>
          <p className="text-xs text-[var(--text-muted)] mb-1">Valid Rate</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-display font-bold text-[var(--status-valid)]">
              {stats.validRate}%
            </p>
            <span className="text-xs text-[var(--status-valid)]/70">deliverable</span>
          </div>
          <div className="mt-2 flex gap-0.5">
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1.5 rounded-full ${
                  i < Math.round(stats.validRate / 10)
                    ? "bg-[var(--status-valid)]"
                    : "bg-[var(--bg-subtle)]"
                }`}
              />
            ))}
          </div>
        </div>

        <div
          className="card bg-[var(--bg-elevated)] border border-[var(--border-strong)] animate-fade-slide-up"
          style={{ "--i": 3 } as React.CSSProperties}
        >
          <p className="text-xs text-[var(--text-muted)] mb-1">Lifetime Total</p>
          <p className="text-3xl font-display font-bold text-[var(--text-primary)]">
            {stats.totalValidated}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">total validated</p>
        </div>
      </div>

      {/* ---- Charts + Activity grid (merged 2×2) ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <ValidationByDayChart data={validationsByDay} />
        <StatusDistribution data={validationsByStatus} />
        <ScoreDistributionChart data={scoreDistribution} />
        <RecentActivityFeed activities={recentActivity} />
      </div>

      {/* ---- Collapsible: Recent Bulk Jobs ---- */}
      <div className="card mb-8">
        <button
          onClick={() => setJobsOpen((prev) => !prev)}
          className="w-full flex items-center justify-between py-1"
          aria-expanded={jobsOpen}
        >
          <h2 className="text-lg font-display font-semibold">Recent Bulk Jobs</h2>
          <div className="flex items-center gap-2">
            <Link
              href="/bulk"
              className="text-sm text-[var(--accent)] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              View all
            </Link>
            {jobsOpen ? (
              <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
            )}
          </div>
        </button>
        {jobsOpen && (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            {recentJobs.length > 0 ? (
              <div className="space-y-3">
                {recentJobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{job.filename}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {job.processed}/{job.totalEmails} processed{" "}
                        {formatDistanceToNow(new Date(job.createdAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                    <div className="ml-4">
                      <span
                        className={`badge ${
                          job.status === "COMPLETED"
                            ? "badge-success"
                            : job.status === "PROCESSING"
                              ? "badge-warning"
                              : job.status === "FAILED"
                                ? "badge-error"
                                : "badge-default"
                        }`}
                      >
                        {job.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center py-8 text-[var(--text-muted)]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mb-4 opacity-50"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                No bulk jobs yet. Upload a CSV to get started!
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
