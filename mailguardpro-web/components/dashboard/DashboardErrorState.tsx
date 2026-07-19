import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui";

interface DashboardErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function DashboardErrorState({ message, onRetry }: DashboardErrorStateProps) {
  return (
    <div className="p-8">
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <AlertCircle className="w-12 h-12 text-[var(--status-invalid)] mb-4" />
        <h2 className="text-xl font-display font-bold mb-2">Failed to load dashboard</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-md">{message}</p>
        <Button onClick={onRetry} variant="accent" type="button">
          Try Again
        </Button>
      </div>
    </div>
  );
}
