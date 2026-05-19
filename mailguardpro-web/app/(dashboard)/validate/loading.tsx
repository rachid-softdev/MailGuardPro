// Loading skeleton for validate page
export default function ValidatePageLoading() {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] p-6">
      <div className="max-w-4xl mx-auto">
        <div className="h-9 w-40 bg-[var(--bg-subtle)] rounded mb-8" />

        {/* Input skeleton */}
        <div className="mb-8">
          <div className="flex gap-4">
            <div className="flex-1 h-14 bg-[var(--bg-subtle)] rounded" />
            <div className="w-32 h-14 bg-[var(--bg-subtle)] rounded" />
          </div>
        </div>

        {/* Results skeleton */}
        <div className="card">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Left: Score */}
            <div className="flex flex-col items-center justify-center lg:w-1/3">
              <div className="w-48 h-48 rounded-full bg-[var(--bg-subtle)]" />
              <div className="mt-4 w-20 h-6 bg-[var(--bg-subtle)] rounded" />
            </div>

            {/* Right: Checks */}
            <div className="flex-1">
              <div className="h-6 w-40 bg-[var(--bg-subtle)] rounded mb-4" />
              <div className="space-y-3">
                {[...Array(10)].map((_, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 py-2 border-b border-[var(--border)]"
                  >
                    <div className="w-5 h-5 bg-[var(--bg-subtle)] rounded" />
                    <div className="flex-1">
                      <div className="h-4 w-24 bg-[var(--bg-subtle)] rounded mb-1" />
                      <div className="h-3 w-40 bg-[var(--bg-subtle)] rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
