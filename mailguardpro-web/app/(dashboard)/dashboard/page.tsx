import { auth } from '@/lib/auth'
import Link from 'next/link'
import { getDashboardData } from './actions'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDistanceToNow } from 'date-fns'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const session = await auth()
  
  if (!session?.user?.id) {
    redirect('/login')
  }

  // Fetch real data from database
  const { stats, recentValidations, recentJobs } = await getDashboardData(session.user.id)

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

      {/* Quick validate */}
      <div className="card mb-8">
        <h2 className="text-lg font-display font-semibold mb-4">Quick Validate</h2>
        <div className="flex gap-4">
          <Link href="/validate" className="btn btn-accent">
            Validate an Email
          </Link>
          <Link href="/bulk" className="btn btn-primary">
            Bulk Upload
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="card">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-2">This Month</p>
          <p className="text-3xl font-display font-bold">{stats.thisMonth}</p>
          <p className="text-xs text-[var(--text-muted)]">validations</p>
        </div>

        <div className="card">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-2">Avg Score</p>
          <p className="text-3xl font-display font-bold">{stats.avgScore}</p>
          <p className="text-xs text-[var(--text-muted)]">/ 100</p>
        </div>

        <div className="card">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-2">Valid Rate</p>
          <p className="text-3xl font-display font-bold text-[var(--status-valid)]">{stats.validRate}%</p>
          <p className="text-xs text-[var(--text-muted)]">emails valid</p>
        </div>

        <div className="card">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-2">Total</p>
          <p className="text-3xl font-display font-bold">{stats.totalValidated}</p>
          <p className="text-xs text-[var(--text-muted)]">validated</p>
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
                      {formatDistanceToNow(new Date(validation.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <span className="text-lg font-bold">{validation.score}</span>
                    <StatusBadge status={validation.status as 'valid' | 'invalid' | 'risky' | 'unknown'} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-[var(--text-muted)]">
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
                      {job.processed}/{job.totalEmails} processed •{' '}
                      {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="ml-4">
                    <span
                      className={`badge ${
                        job.status === 'COMPLETED'
                          ? 'badge-success'
                          : job.status === 'PROCESSING'
                          ? 'badge-warning'
                          : job.status === 'FAILED'
                          ? 'badge-error'
                          : 'badge-default'
                      }`}
                    >
                      {job.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-[var(--text-muted)]">
              No bulk jobs yet. Upload a CSV to get started!
            </div>
          )}
        </div>
      </div>
    </div>
  )
}