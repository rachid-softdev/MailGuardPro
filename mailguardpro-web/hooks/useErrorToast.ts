"use client";

import { createContext, useContext } from "react";

export interface Toast {
  id: string;
  type: "error" | "warning" | "info";
  title: string;
  message: string;
  onRetry?: () => void;
}

export interface ErrorToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => string;
  dismissToast: (id: string) => void;
}

export const ErrorToastContext = createContext<ErrorToastContextValue | null>(null);

export function useErrorToast(): ErrorToastContextValue {
  const ctx = useContext(ErrorToastContext);
  if (!ctx) {
    throw new Error("useErrorToast must be used within ErrorToastProvider");
  }
  return ctx;
}
