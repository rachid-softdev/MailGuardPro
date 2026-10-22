import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui";

interface DashboardErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function DashboardErrorState({ message, onRetry }: DashboardErrorStateProps) {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex min-h-[420px] flex-col items-center justify-center border border-[var(--line-strong)] bg-[var(--surface)] px-6 text-center">
        <AlertCircle className="h-7 w-7 text-[var(--status-invalid)]" aria-hidden="true" />
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
          Connection error
        </p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--ink)]">Failed to load dashboard</h2>
        <p className="mt-2 max-w-md text-sm text-[var(--ink-2)]">{message}</p>
        <Button onClick={onRetry} variant="primary" type="button" className="mt-5">
          Try again
        </Button>
      </div>
    </div>
  );
}
