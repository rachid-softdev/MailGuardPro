// Loading skeleton for dashboard page
export default function DashboardPageLoading() {
  return (
    <div className="animate-pulse">
      <div className="h-9 w-32 bg-[var(--bg-subtle)] rounded mb-2" />
      <div className="h-5 w-48 bg-[var(--bg-subtle)] rounded mb-8" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card">
            <div className="h-3 w-20 bg-[var(--bg-subtle)] rounded mb-2" />
            <div className="h-8 w-16 bg-[var(--bg-subtle)] rounded mb-1" />
            <div className="h-3 w-12 bg-[var(--bg-subtle)] rounded" />
          </div>
        ))}
      </div>

      <div className="card">
        <div className="h-6 w-40 bg-[var(--bg-subtle)] rounded mb-4" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-[var(--border)]">
              <div className="w-4 h-4 bg-[var(--bg-subtle)] rounded" />
              <div className="flex-1">
                <div className="h-4 w-48 bg-[var(--bg-subtle)] rounded mb-1" />
                <div className="h-3 w-32 bg-[var(--bg-subtle)] rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}