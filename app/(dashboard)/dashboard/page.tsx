import { auth } from '@/lib/auth'
import Link from 'next/link'

export default async function DashboardPage() {
  const session = await auth()
  
  // Mock data pour la démo
  const stats = {
    thisMonth: 47,
    avgScore: 78,
    validRate: 82,
    totalValidated: 156,
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold mb-2">Dashboard</h1>
        <p className="text-[var(--text-secondary)]">
          Welcome back, {session?.user?.name || session?.user?.email}
        </p>
      </div>

      {/* Quick validate */}
      <div className="card mb-8">
        <h2 className="text-lg font-display font-semibold mb-4">Quick Validate</h2>
        <div className="flex gap-4">
          <input
            type="email"
            placeholder="Enter an email..."
            className="input flex-1"
          />
          <Link href="/validate" className="btn btn-accent">
            Validate
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

      {/* Recent activity */}
      <div className="card">
        <h2 className="text-lg font-display font-semibold mb-4">Recent Validations</h2>
        <div className="text-center py-8 text-[var(--text-muted)]">
          No recent validations. Start by validating an email above!
        </div>
      </div>
    </div>
  )
}