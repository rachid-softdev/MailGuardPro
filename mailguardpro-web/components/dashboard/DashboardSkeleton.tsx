export function DashboardSkeleton() {
  return (
    <div className="p-4 sm:p-6 lg:p-8" aria-busy="true" aria-label="Loading dashboard">
      <div className="mb-5">
        <div className="h-2.5 w-32 animate-skeleton" />
        <div className="mt-3 h-8 w-44 animate-skeleton" />
        <div className="mt-2 h-3 w-64 animate-skeleton" />
        <div className="mt-4 h-px w-full bg-[var(--line)]" />
      </div>

      <div className="mb-4 border border-[var(--line-strong)] bg-[var(--surface)]">
        <div className="border-b border-[var(--line)] px-3.5 py-2">
          <div className="h-2.5 w-24 animate-skeleton" />
        </div>
        <div className="p-3.5">
          <div className="h-[38px] w-full animate-skeleton" />
        </div>
      </div>

      <div className="border border-[var(--line-strong)] bg-[var(--surface)]">
        <div className="grid lg:grid-cols-[1.05fr_1.95fr]">
          <div className="border-b border-[var(--line)] p-5 lg:border-b-0 lg:border-r sm:p-6">
            <div className="h-2.5 w-28 animate-skeleton" />
            <div className="mt-5 h-12 w-24 animate-skeleton" />
            <div className="mt-5 h-3 w-full animate-skeleton" />
            <div className="mt-2 flex justify-between">
              <div className="h-2 w-4 animate-skeleton" />
              <div className="h-2 w-4 animate-skeleton" />
              <div className="h-2 w-4 animate-skeleton" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-[var(--line)]">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="bg-[var(--surface)] p-4 sm:p-5">
                <div className="h-2.5 w-24 animate-skeleton" />
                <div className="mt-3 h-7 w-20 animate-skeleton" />
                <div className="mt-2 h-2 w-16 animate-skeleton" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="border border-[var(--line)] bg-[var(--surface)] xl:col-span-2">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <div className="h-2.5 w-24 animate-skeleton" />
          </div>
          <div className="flex h-56 items-end gap-2 p-5">
            {[52, 86, 64, 108, 78, 120, 92, 70, 104, 88, 56, 98, 76, 112].map((height, index) => (
              <div key={index} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full animate-skeleton" style={{ height }} />
              </div>
            ))}
          </div>
        </div>
        <div className="border border-[var(--line)] bg-[var(--surface)]">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <div className="h-2.5 w-20 animate-skeleton" />
          </div>
          <div className="space-y-4 p-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center justify-between gap-4">
                <div className="h-2.5 w-20 animate-skeleton" />
                <div className="h-2.5 w-10 animate-skeleton" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 border border-[var(--line)] bg-[var(--surface)]">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <div className="h-2.5 w-28 animate-skeleton" />
        </div>
        <div className="space-y-3 p-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="h-3 w-44 animate-skeleton" />
              <div className="h-3 w-24 animate-skeleton" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
