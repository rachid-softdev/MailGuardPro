"use client";

import { formatDistanceToNow } from "date-fns";
import { Activity, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { DashboardErrorState } from "@/components/dashboard/DashboardErrorState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { QuickValidate } from "@/components/dashboard/QuickValidate";
import { Button } from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ScoreGauge, ScoreMeter } from "@/components/validator/ScoreGauge";
import { usePolling } from "@/hooks/usePolling";
import { cn } from "@/lib/cn";
import { getScoreBand } from "@/lib/score";

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

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function PanelHead({ title, meta, action }: { title: string; meta?: string; action?: ReactNode }) {
  return (
    <div className="panel-head">
      <div className="flex min-w-0 items-center gap-2.5">
        <h2 className="panel-title">{title}</h2>
        {meta && (
          <span className="hidden font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--ink-3)] sm:inline">
            {meta}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}

function EmptyPanel({
  title,
  body,
  href,
  linkLabel,
}: {
  title: string;
  body: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="flex flex-col items-start gap-3 px-4 py-8">
      <Activity className="h-5 w-5 text-[var(--ink-3)]" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium text-[var(--ink)]">{title}</p>
        <p className="mt-1 text-xs text-[var(--ink-3)]">{body}</p>
      </div>
      <Link
        href={href}
        className="text-xs font-medium text-[var(--ink)] underline decoration-[var(--line-strong)] underline-offset-4 hover:text-[var(--accent-text)]"
      >
        {linkLabel}
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Readout({
  label,
  value,
  sub,
  children,
}: {
  label: string;
  value: string | number;
  sub: string;
  children?: ReactNode;
}) {
  return (
    <div className="bg-[var(--surface)] p-4 sm:p-5">
      <p className="label-mono">{label}</p>
      <p className="mt-2 font-display text-[26px] font-semibold leading-none tracking-[-0.035em] text-[var(--ink)] tabular">
        {typeof value === "number" ? formatCount(value) : value}
      </p>
      <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
        {sub}
      </p>
      {children}
    </div>
  );
}

function ThroughputChart({ data }: { data: DayData[] }) {
  const maxCount = Math.max(...data.map((day) => day.count), 1);
  const total = data.reduce((sum, day) => sum + day.count, 0);

  return (
    <section className="panel" aria-labelledby="throughput-title">
      <PanelHead
        title="Throughput"
        meta="Last 14 days"
        action={
          <span className="font-mono text-[10px] text-[var(--ink-2)]">
            {formatCount(total)} total
          </span>
        }
      />
      <div className="p-4 sm:p-5">
        <div
          className="flex h-44 items-end gap-1 border-b border-[var(--line-strong)] pb-1"
          role="img"
          aria-label={`Bar chart: email validations per day. ${data
            .map((day) => `${day.date}: ${day.count} (average score ${day.avgScore})`)
            .join(", ")}`}
        >
          {data.map((day) => {
            const height = Math.max((day.count / maxCount) * 118, day.count > 0 ? 2 : 0);
            const date = new Date(day.date + "T00:00:00");
            const dayLabel = date.toLocaleDateString("en-US", { weekday: "narrow" });
            const fullLabel = date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });

            return (
              <div
                key={day.date}
                className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                title={`${fullLabel}: ${day.count} validations, average score ${day.avgScore}`}
                aria-hidden="true"
              >
                <span className="font-mono text-[9px] leading-none text-[var(--ink-3)] opacity-0 transition-opacity group-hover:opacity-100">
                  {day.count}
                </span>
                <div
                  className={cn(
                    "w-full max-w-[26px] transition-colors duration-150",
                    day.count > 0
                      ? "bg-[var(--ink)] group-hover:bg-[var(--accent)]"
                      : "bg-[var(--surface-3)]",
                  )}
                  style={{ height: `${height}px` }}
                />
                <span className="mt-1 w-full truncate text-center font-mono text-[8px] uppercase text-[var(--ink-3)]">
                  {dayLabel}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
          <span>Bars = inspections</span>
          <span>Hover for daily average</span>
        </div>
      </div>
    </section>
  );
}

function StatusDistribution({ data }: { data: StatusData[] }) {
  const total = data.reduce((sum, item) => sum + item.count, 0);

  const statusOrder = ["valid", "risky", "invalid", "unknown"];
  const colors: Record<string, string> = {
    valid: "var(--status-valid)",
    invalid: "var(--status-invalid)",
    risky: "var(--status-risky)",
    unknown: "var(--status-unknown)",
  };
  const sorted = [...data].sort(
    (a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status),
  );

  return (
    <section className="panel" aria-labelledby="status-title">
      <PanelHead
        title="Status mix"
        action={
          <span className="font-mono text-[10px] text-[var(--ink-2)]">
            {formatCount(total)} total
          </span>
        }
      />
      <div className="p-4 sm:p-5">
        {total === 0 ? (
          <p className="py-8 text-center text-xs text-[var(--ink-3)]">No inspections yet.</p>
        ) : (
          <>
            <div
              className="flex h-3 w-full gap-px bg-[var(--line)]"
              role="img"
              aria-label={`Status distribution: ${sorted
                .map(
                  (item) =>
                    `${item.status}: ${item.count} (${Math.round((item.count / total) * 100)}%)`,
                )
                .join(", ")}`}
            >
              {sorted.map((item) => (
                <div
                  key={item.status}
                  style={{
                    width: `${(item.count / total) * 100}%`,
                    backgroundColor: colors[item.status] || "var(--surface-3)",
                  }}
                  title={`${item.status}: ${item.count}`}
                  aria-hidden="true"
                />
              ))}
            </div>
            <div className="mt-4 divide-y divide-[var(--line)] border-t border-[var(--line)]">
              {sorted.map((item) => {
                const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                return (
                  <div key={item.status} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-1.5 w-1.5 shrink-0"
                        style={{ backgroundColor: colors[item.status] || "var(--surface-3)" }}
                        aria-hidden="true"
                      />
                      <span className="text-[11px] capitalize text-[var(--ink-2)]">
                        {item.status}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2 font-mono text-[10px]">
                      <span className="text-[var(--ink)]">{formatCount(item.count)}</span>
                      <span className="w-7 text-right text-[var(--ink-3)]">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function ScoreDistributionChart({ data }: { data: ScoreDist[] }) {
  const maxCount = Math.max(...data.map((item) => item.count), 1);
  const allZero = data.every((item) => item.count === 0);
  const bandColors = [
    "var(--score-critical)",
    "var(--score-poor)",
    "var(--score-medium)",
    "var(--score-good)",
    "var(--score-excellent)",
  ];

  return (
    <section className="panel" aria-labelledby="score-dist-title">
      <PanelHead title="Score distribution" meta="All inspections" />
      <div className="p-4 sm:p-5">
        {allZero ? (
          <p className="py-8 text-center text-xs text-[var(--ink-3)]">No scores yet.</p>
        ) : (
          <div
            className="space-y-3.5"
            role="img"
            aria-label={`Score distribution: ${data.map((item) => `${item.range}: ${item.count}`).join(", ")}`}
          >
            {data.map((item, index) => (
              <div key={item.range}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-[10px] text-[var(--ink-2)]">{item.range}</span>
                  <span className="font-mono text-[10px] text-[var(--ink-3)]">
                    {formatCount(item.count)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full bg-[var(--surface-2)]">
                  <div
                    className="h-full transition-[width] duration-500"
                    style={{
                      width: `${(item.count / maxCount) * 100}%`,
                      backgroundColor: bandColors[index] ?? "var(--ink-3)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function RecentInspections({ activities }: { activities: ActivityItem[] }) {
  return (
    <section className="panel" aria-labelledby="recent-title">
      <PanelHead
        title="Recent inspections"
        action={
          <Link
            href="/history"
            className="text-[11px] font-medium text-[var(--ink-2)] underline decoration-[var(--line-strong)] underline-offset-2 hover:text-[var(--ink)]"
          >
            View all
          </Link>
        }
      />
      {activities.length > 0 ? (
        <div className="max-h-[320px] overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Address</th>
                <th scope="col" className="hidden sm:table-cell">
                  When
                </th>
                <th scope="col">Score</th>
                <th scope="col" className="text-right">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {activities.slice(0, 10).map((activity, index) => (
                <tr key={`${activity.email}-${index}`}>
                  <td className="max-w-[180px] truncate font-mono text-[11px] text-[var(--ink)]">
                    {maskEmail(activity.email)}
                  </td>
                  <td className="hidden whitespace-nowrap text-[11px] text-[var(--ink-3)] sm:table-cell">
                    {formatDistanceToNow(new Date(activity.time), { addSuffix: true })}
                  </td>
                  <td>
                    <ScoreMeter score={activity.score} />
                  </td>
                  <td className="text-right">
                    <StatusBadge
                      status={activity.status as "valid" | "invalid" | "risky" | "unknown"}
                      showDot={false}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyPanel
          title="No inspections yet"
          body="Run the first address through the validator to start the ledger."
          href="/validate"
          linkLabel="Inspect an address"
        />
      )}
    </section>
  );
}

function jobStamp(status: string) {
  if (status === "COMPLETED") return "stamp stamp-pass";
  if (status === "PROCESSING") return "stamp stamp-warn";
  if (status === "FAILED") return "stamp stamp-fail";
  return "stamp stamp-idle";
}

function RecentBatches({ jobs }: { jobs: JobItem[] }) {
  return (
    <section className="panel" aria-labelledby="batches-title">
      <PanelHead
        title="Recent batches"
        meta={`${jobs.length} loaded`}
        action={
          <Link
            href="/bulk"
            className="text-[11px] font-medium text-[var(--ink-2)] underline decoration-[var(--line-strong)] underline-offset-2 hover:text-[var(--ink)]"
          >
            Open bulk
          </Link>
        }
      />
      {jobs.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th scope="col">File</th>
                <th scope="col">Progress</th>
                <th scope="col" className="hidden sm:table-cell">
                  Created
                </th>
                <th scope="col" className="text-right">
                  State
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.slice(0, 5).map((job) => {
                const pct =
                  job.totalEmails > 0
                    ? Math.min(100, Math.round((job.processed / job.totalEmails) * 100))
                    : 0;
                return (
                  <tr key={job.id}>
                    <td className="max-w-[220px] truncate font-mono text-[11px] text-[var(--ink)]">
                      {job.filename}
                    </td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="h-1.5 w-20 bg-[var(--surface-2)]">
                          <span
                            className="block h-full bg-[var(--accent)]"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="hidden font-mono text-[10px] text-[var(--ink-3)] sm:inline">
                          {formatCount(job.processed)}/{formatCount(job.totalEmails)}
                        </span>
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap text-[11px] text-[var(--ink-3)] sm:table-cell">
                      {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                    </td>
                    <td className="text-right">
                      <span className={jobStamp(job.status)}>{job.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyPanel
          title="No batches yet"
          body="Upload a CSV to send a list through the line."
          href="/bulk"
          linkLabel="Start a batch"
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [ticker, setTicker] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTicker((value) => value + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

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
      // Keep the last known-good state on transient refresh errors.
    },
  });

  if (loading && !data) {
    return <DashboardSkeleton />;
  }

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

  const avgBand = getScoreBand(stats.avgScore);
  const creditsLabel = user.plan === "BUSINESS" ? "Unlimited" : formatCount(user.creditsRemaining);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <header className="mb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="label-mono flex items-center gap-2">
              <span className="h-1.5 w-1.5 bg-[var(--accent)]" aria-hidden="true" />
              Control room / live
            </p>
            <h1 className="mt-2 font-display text-[clamp(1.9rem,3.2vw,2.6rem)] font-semibold leading-none tracking-[-0.04em] text-[var(--ink)]">
              Dashboard
            </h1>
            <p className="mt-2 text-[13px] text-[var(--ink-2)]">
              Welcome back, {user.name || user.email || "operator"}. The line is running.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button href="/bulk" variant="secondary" size="sm">
              New batch
            </Button>
            <Button href="/validate" variant="primary" size="sm">
              Inspect address
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--line)] pt-3">
          <span className="badge badge-accent">{user.plan}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
            {creditsLabel} credits
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
            <span className="h-1 w-1 animate-pulse-dot bg-[var(--accent)]" aria-hidden="true" />
            Auto-refresh / 30s
          </span>
          {lastUpdated && (
            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              <span suppressHydrationWarning key={ticker}>
                Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
              </span>
            </span>
          )}
        </div>
      </header>

      <div className="mb-4">
        <QuickValidate />
      </div>

      <section
        className="border border-[var(--line-strong)] bg-[var(--surface)]"
        aria-label="Monthly summary"
      >
        <div className="grid lg:grid-cols-[1.05fr_1.95fr]">
          <div className="border-b border-[var(--line)] p-5 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-3">
              <h2 className="panel-title">Average verdict</h2>
              <span className="stamp stamp-idle">
                {stats.thisMonth > 0 ? avgBand.short : "No data"}
              </span>
            </div>
            <div className="mt-5">
              {stats.thisMonth > 0 ? (
                <ScoreGauge score={stats.avgScore} label="This month" showScale showBand={false} />
              ) : (
                <div className="flex min-h-[154px] flex-col justify-center border border-dashed border-[var(--line)] px-4 py-5">
                  <p className="font-display text-4xl font-semibold tracking-[-0.04em] text-[var(--ink-3)]">
                    —
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--ink-3)]">
                    No scored inspections this month. Run an address to start the average.
                  </p>
                </div>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-px border-t border-[var(--line)] bg-[var(--line)]">
              <div className="bg-[var(--surface)] pt-3 pr-3">
                <p className="label-mono text-[8px]">7-day avg</p>
                <p className="mt-1 font-mono text-sm text-[var(--ink)]">{trends.weekAvg}</p>
              </div>
              <div className="bg-[var(--surface)] pl-3 pt-3">
                <p className="label-mono text-[8px]">30-day avg</p>
                <p className="mt-1 font-mono text-sm text-[var(--ink)]">{trends.monthAvg}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px bg-[var(--line)]">
            <Readout
              label="Inspections this month"
              value={stats.thisMonth}
              sub={`${formatCount(trends.todayCount)} today`}
            />
            <Readout
              label="Valid rate"
              value={`${stats.validRate}%`}
              sub={stats.thisMonth > 0 ? "valid status" : "no inspections"}
            >
              <div className="mt-2.5 flex gap-px" aria-hidden="true">
                {Array.from({ length: 10 }).map((_, index) => (
                  <span
                    key={index}
                    className="h-1 flex-1"
                    style={{
                      backgroundColor:
                        index < Math.round(stats.validRate / 10)
                          ? "var(--status-valid)"
                          : "var(--surface-3)",
                    }}
                  />
                ))}
              </div>
            </Readout>
            <Readout label="Lifetime total" value={stats.totalValidated} sub="all inspections" />
            <Readout label="Credits left" value={creditsLabel} sub={`${user.plan} plan`} />
          </div>
        </div>
      </section>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ThroughputChart data={validationsByDay} />
        </div>
        <StatusDistribution data={validationsByStatus} />
        <ScoreDistributionChart data={scoreDistribution} />
        <div className="xl:col-span-2">
          <RecentInspections activities={recentActivity} />
        </div>
      </div>

      <div className="mt-4">
        <RecentBatches jobs={recentJobs} />
      </div>
    </div>
  );
}
