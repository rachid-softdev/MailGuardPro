"use client";

import { ErrorToast } from "@/components/ui/ErrorToast";
import { useErrorToast } from "@/hooks/useErrorToast";

export function ErrorToastContainer() {
  const { toasts, dismissToast } = useErrorToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[50] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ErrorToast {...toast} onDismiss={dismissToast} />
        </div>
      ))}
    </div>
  );
}
