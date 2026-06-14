import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { redirect } from "next/navigation";
import { QuickValidate } from "@/components/dashboard/QuickValidate";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { auth } from "@/lib/auth";
import { getDashboardData } from "./actions";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  // Fetch real data from database
  const { stats, recentValidations, recentJobs } = await getDashboardData(session.user.id);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold mb-2">Dashboard</h1>
        <p className="text-[var(--text-secondary)]">
          Welcome back, {session?.user?.name || session?.user?.email}
        </p>
        <div className="mt-2 flex items-center gap-3">
          <span className="badge badge-accent">{stats.plan}</span>
          <span className="text-sm text-[var(--text-muted)]">
            {stats.creditsRemaining} credits remaining
          </span>
        </div>
      </div>

      {/* Quick validate — inline */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div
          className="card border-t-2 border-t-[var(--accent)]"
          title="Total validations performed this month. Resets on the 1st of each month."
        >
          <div className="flex items-start justify-between mb-1">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest">This Month</p>
            <svg
              className="w-4 h-4 text-[var(--status-valid)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              />
            </svg>
          </div>
          <p className="text-3xl font-display font-bold">{stats.thisMonth}</p>
          <p className="text-xs text-[var(--text-muted)]">validations this month</p>
        </div>

        <div
          className="card"
          title="Average quality score across all validations. 80+ is highly deliverable."
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest">Avg Score</p>
            <span
              className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${
                stats.avgScore >= 80
                  ? "text-[var(--status-valid)] bg-[var(--status-valid)]/10"
                  : stats.avgScore >= 60
                    ? "text-yellow-500 bg-yellow-500/10"
                    : "text-[var(--status-invalid)] bg-[var(--status-invalid)]/10"
              }`}
            >
              {stats.avgScore >= 80 ? "Good" : stats.avgScore >= 60 ? "Fair" : "Poor"}
            </span>
          </div>
          <p className="text-3xl font-display font-bold">{stats.avgScore}</p>
          <div className="mt-2 w-full h-1.5 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                stats.avgScore >= 80
                  ? "bg-[var(--status-valid)]"
                  : stats.avgScore >= 60
                    ? "bg-yellow-500"
                    : "bg-[var(--status-invalid)]"
              }`}
              style={{ width: `${stats.avgScore}%` }}
            />
          </div>
        </div>

        <div className="card">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-1">
            Valid Rate
          </p>
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

        <div className="card bg-[var(--bg-elevated)] border border-[var(--border-strong)]">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-1">
            Lifetime Total
          </p>
          <p className="text-3xl font-display font-bold text-[var(--text-primary)]">
            {stats.totalValidated}
          </p>
          <p className="text-xs text-[var(--text-muted)]">emails validated</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent validations */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-display font-semibold">Recent Validations</h2>
            <Link href="/history" className="text-sm text-[var(--accent)] hover:underline">
              View all
            </Link>
          </div>
          {recentValidations.length > 0 ? (
            <div className="space-y-3">
              {recentValidations.slice(0, 5).map((validation) => (
                <div
                  key={validation.id}
                  className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm truncate">{validation.email}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {formatDistanceToNow(new Date(validation.createdAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <span className="text-lg font-bold">{validation.score}</span>
                    <StatusBadge
                      status={validation.status as "valid" | "invalid" | "risky" | "unknown"}
                    />
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
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              No recent validations. Start by validating an email above!
            </div>
          )}
        </div>

        {/* Recent bulk jobs */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-display font-semibold">Recent Bulk Jobs</h2>
            <Link href="/bulk" className="text-sm text-[var(--accent)] hover:underline">
              View all
            </Link>
          </div>
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
                      {job.processed}/{job.totalEmails} processed •{" "}
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
      </div>
    </div>
  );
}
