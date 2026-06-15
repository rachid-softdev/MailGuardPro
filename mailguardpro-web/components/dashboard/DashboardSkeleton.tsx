export function DashboardSkeleton() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="h-9 w-48 bg-[var(--bg-subtle)] rounded animate-pulse mb-2" />
        <div className="h-5 w-72 bg-[var(--bg-subtle)] rounded animate-pulse" />
      </div>
      <div className="card mb-8 animate-pulse">
        <div className="h-5 w-28 bg-[var(--bg-subtle)] rounded mb-4" />
        <div className="flex gap-4">
          <div className="h-9 w-32 bg-[var(--bg-subtle)] rounded" />
          <div className="h-9 w-28 bg-[var(--bg-subtle)] rounded" />
        </div>
      </div>
      {/* Trend cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card animate-pulse flex items-center gap-4">
            <div className="p-2 rounded-lg bg-[var(--bg-subtle)]">
              <div className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="h-3 w-16 bg-[var(--bg-subtle)] rounded mb-2" />
              <div className="h-7 w-12 bg-[var(--bg-subtle)] rounded mb-1" />
              <div className="h-3 w-20 bg-[var(--bg-subtle)] rounded" />
            </div>
          </div>
        ))}
      </div>
      {/* KPI cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card animate-pulse">
            <div className="h-3 w-20 bg-[var(--bg-subtle)] rounded mb-3" />
            <div className="h-8 w-16 bg-[var(--bg-subtle)] rounded mb-2" />
            <div className="h-3 w-24 bg-[var(--bg-subtle)] rounded" />
          </div>
        ))}
      </div>
      {/* Charts skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="card animate-pulse">
          <div className="h-4 w-36 bg-[var(--bg-subtle)] rounded mb-4" />
          <div className="flex items-end gap-2 h-48">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="h-3 w-6 bg-[var(--bg-subtle)] rounded" />
                <div
                  className="w-full bg-[var(--bg-subtle)] rounded-t"
                  style={{ height: `${20 + Math.random() * 120}px` }}
                />
                <div className="h-3 w-8 bg-[var(--bg-subtle)] rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="card animate-pulse">
          <div className="h-4 w-36 bg-[var(--bg-subtle)] rounded mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--bg-subtle)]" />
                  <div className="h-3 w-16 bg-[var(--bg-subtle)] rounded" />
                </div>
                <div className="h-3 w-20 bg-[var(--bg-subtle)] rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Bottom skeletons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card animate-pulse">
          <div className="h-5 w-32 bg-[var(--bg-subtle)] rounded mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div className="flex-1">
                  <div className="h-4 w-44 bg-[var(--bg-subtle)] rounded mb-1" />
                  <div className="h-3 w-24 bg-[var(--bg-subtle)] rounded" />
                </div>
                <div className="h-5 w-14 bg-[var(--bg-subtle)] rounded ml-4" />
              </div>
            ))}
          </div>
        </div>
        <div className="card animate-pulse">
          <div className="h-5 w-28 bg-[var(--bg-subtle)] rounded mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div className="flex-1">
                  <div className="h-4 w-36 bg-[var(--bg-subtle)] rounded mb-1" />
                  <div className="h-3 w-28 bg-[var(--bg-subtle)] rounded" />
                </div>
                <div className="h-5 w-20 bg-[var(--bg-subtle)] rounded ml-4" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
