// Loading skeleton for dashboard layout
export default function DashboardLoading() {
  return (
    <div className="p-8">
      {/* Header skeleton */}
      <div className="mb-8">
        <div className="h-9 w-32 bg-[var(--bg-subtle)] rounded animate-pulse mb-2" />
        <div className="h-5 w-48 bg-[var(--bg-subtle)] rounded animate-pulse" />
      </div>

      {/* Quick validate card skeleton */}
      <div className="card mb-8">
        <div className="h-6 w-32 bg-[var(--bg-subtle)] rounded animate-pulse mb-4" />
        <div className="flex gap-4">
          <div className="flex-1 h-12 bg-[var(--bg-subtle)] rounded animate-pulse" />
          <div className="w-24 h-12 bg-[var(--bg-subtle)] rounded animate-pulse" />
        </div>
      </div>

      {/* KPI Cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card">
            <div className="h-3 w-20 bg-[var(--bg-subtle)] rounded animate-pulse mb-2" />
            <div className="h-8 w-16 bg-[var(--bg-subtle)] rounded animate-pulse mb-1" />
            <div className="h-3 w-12 bg-[var(--bg-subtle)] rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Recent activity skeleton */}
      <div className="card">
        <div className="h-6 w-40 bg-[var(--bg-subtle)] rounded animate-pulse mb-4" />
        <div className="text-center py-8">
          <div className="h-4 w-64 bg-[var(--bg-subtle)] rounded animate-pulse mx-auto" />
        </div>
      </div>
    </div>
  );
}
