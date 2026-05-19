// Loading skeleton for marketing/landing pages
export default function MarketingLoading() {
  return (
    <div className="min-h-screen">
      {/* Header skeleton */}
      <div className="border-b border-[var(--border)]">
        <div className="max-w-[var(--container-xl)] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[var(--bg-subtle)] rounded animate-pulse" />
            <div className="h-6 w-28 bg-[var(--bg-subtle)] rounded animate-pulse" />
          </div>
          <div className="hidden md:flex items-center gap-8">
            <div className="h-4 w-20 bg-[var(--bg-subtle)] rounded animate-pulse" />
            <div className="h-4 w-16 bg-[var(--bg-subtle)] rounded animate-pulse" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-16 bg-[var(--bg-subtle)] rounded animate-pulse" />
            <div className="h-8 w-20 bg-[var(--bg-subtle)] rounded animate-pulse" />
          </div>
        </div>
      </div>

      {/* Hero section skeleton */}
      <section className="py-20 md:py-32">
        <div className="max-w-[var(--container-lg)] mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto">
            {/* H1 skeleton */}
            <div className="h-12 w-3/4 bg-[var(--bg-subtle)] rounded animate-pulse mx-auto mb-6" />
            <div className="h-6 w-full bg-[var(--bg-subtle)] rounded animate-pulse mx-auto mb-2" />
            <div className="h-6 w-2/3 bg-[var(--bg-subtle)] rounded animate-pulse mx-auto mb-8" />

            {/* CTA buttons skeleton */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
              <div className="h-12 w-32 bg-[var(--bg-subtle)] rounded animate-pulse" />
              <div className="h-12 w-32 bg-[var(--bg-subtle)] rounded animate-pulse" />
            </div>

            {/* Demo placeholder skeleton */}
            <div className="card max-w-xl mx-auto">
              <div className="text-center py-8">
                <div className="h-4 w-48 bg-[var(--bg-subtle)] rounded animate-pulse mx-auto mb-4" />
                <div className="flex gap-2 max-w-md mx-auto">
                  <div className="flex-1 h-10 bg-[var(--bg-subtle)] rounded animate-pulse" />
                  <div className="w-20 h-10 bg-[var(--bg-subtle)] rounded animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features section skeleton */}
      <section className="py-20 border-t border-[var(--border)]">
        <div className="max-w-[var(--container-lg)] mx-auto px-6">
          <div className="h-8 w-56 bg-[var(--bg-subtle)] rounded animate-pulse mx-auto mb-12" />
          <div className="grid md:grid-cols-3 gap-8">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="card">
                <div className="w-12 h-12 bg-[var(--bg-subtle)] rounded-lg mb-4 animate-pulse" />
                <div className="h-6 w-3/4 bg-[var(--bg-subtle)] rounded animate-pulse mb-2" />
                <div className="h-4 w-full bg-[var(--bg-subtle)] rounded animate-pulse" />
                <div className="h-4 w-2/3 bg-[var(--bg-subtle)] rounded animate-pulse mt-1" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer skeleton */}
      <footer className="border-t border-[var(--border)] py-12">
        <div className="max-w-[var(--container-lg)] mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-[var(--bg-subtle)] rounded animate-pulse" />
              <div className="h-5 w-24 bg-[var(--bg-subtle)] rounded animate-pulse" />
            </div>
            <div className="flex items-center gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-4 w-12 bg-[var(--bg-subtle)] rounded animate-pulse" />
              ))}
            </div>
            <div className="h-4 w-20 bg-[var(--bg-subtle)] rounded animate-pulse" />
          </div>
        </div>
      </footer>
    </div>
  );
}
