"use client";

import { useCallback, useState } from "react";
import type { Toast } from "@/hooks/useErrorToast";
import { ErrorToastContext } from "@/hooks/useErrorToast";

let nextToastId = 1;

export function ErrorToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = `toast-${nextToastId++}`;
    setToasts((prev) => {
      const next = [...prev, { ...toast, id }];
      // Keep max 5 toasts — remove oldest
      if (next.length > 5) {
        return next.slice(next.length - 5);
      }
      return next;
    });
    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ErrorToastContext.Provider value={{ toasts, addToast, dismissToast }}>
      {children}
    </ErrorToastContext.Provider>
  );
}
