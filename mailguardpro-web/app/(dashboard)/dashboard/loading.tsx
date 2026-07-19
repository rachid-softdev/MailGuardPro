import { Card } from "@/components/ui";

export default function DashboardLoading() {
  return (
    <div className="p-8">
      {/* Header skeleton */}
      <div className="mb-8">
        <div className="h-9 w-48 bg-[var(--bg-subtle)] rounded animate-pulse mb-2" />
        <div className="h-5 w-72 bg-[var(--bg-subtle)] rounded animate-pulse" />
      </div>

      {/* Quick validate skeleton */}
      <Card variant="default" padding="md" className="mb-8">
        <div className="h-6 w-32 bg-[var(--bg-subtle)] rounded animate-pulse mb-4" />
        <div className="flex gap-4">
          <div className="h-10 w-36 bg-[var(--bg-subtle)] rounded animate-pulse" />
          <div className="h-10 w-32 bg-[var(--bg-subtle)] rounded animate-pulse" />
        </div>
      </Card>

      {/* KPI Cards skeleton (4-column grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} variant="default" padding="md" className="animate-pulse">
            <div className="h-3 w-20 bg-[var(--bg-subtle)] rounded mb-3" />
            <div className="h-8 w-16 bg-[var(--bg-subtle)] rounded mb-2" />
            <div className="h-3 w-24 bg-[var(--bg-subtle)] rounded" />
          </Card>
        ))}
      </div>

      {/* Two column section skeletons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card variant="default" padding="md" className="animate-pulse">
          <div className="h-6 w-40 bg-[var(--bg-subtle)] rounded mb-4" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div className="flex-1">
                  <div className="h-4 w-48 bg-[var(--bg-subtle)] rounded mb-1" />
                  <div className="h-3 w-24 bg-[var(--bg-subtle)] rounded" />
                </div>
                <div className="h-5 w-16 bg-[var(--bg-subtle)] rounded ml-4" />
              </div>
            ))}
          </div>
        </Card>
        <Card variant="default" padding="md" className="animate-pulse">
          <div className="h-6 w-36 bg-[var(--bg-subtle)] rounded mb-4" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div className="flex-1">
                  <div className="h-4 w-40 bg-[var(--bg-subtle)] rounded mb-1" />
                  <div className="h-3 w-32 bg-[var(--bg-subtle)] rounded" />
                </div>
                <div className="h-5 w-20 bg-[var(--bg-subtle)] rounded ml-4" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
