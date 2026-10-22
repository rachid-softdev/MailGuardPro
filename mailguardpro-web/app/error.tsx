"use client";

export default function RootError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
      <div className="max-w-md text-center">
        <p className="label-mono mb-2">System / error</p>
        <h2 className="mb-2 font-display text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
          Something went wrong
        </h2>
        <p className="mb-6 text-[13px] text-[var(--ink-2)]">An unexpected error occurred.</p>
        <button onClick={() => reset()} className="btn btn-accent btn-md">
          Try again
        </button>
      </div>
    </div>
  );
}
