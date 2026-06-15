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
  /** History of all dismissed notifications, newest first */
  history: Toast[];
  /** Number of unread items in history */
  unreadCount: number;
  /** Mark all notifications as read */
  markAllRead: () => void;
  /** Clear notification history */
  clearHistory: () => void;
}

export const ErrorToastContext = createContext<ErrorToastContextValue | null>(null);

export function useErrorToast(): ErrorToastContextValue {
  const ctx = useContext(ErrorToastContext);
  if (!ctx) {
    throw new Error("useErrorToast must be used within ErrorToastProvider");
  }
  return ctx;
}
