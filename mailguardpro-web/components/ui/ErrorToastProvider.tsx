"use client";

import { useCallback, useRef, useState } from "react";
import type { Toast } from "@/hooks/useErrorToast";
import { ErrorToastContext } from "@/hooks/useErrorToast";

const MAX_HISTORY = 50;

let nextToastId = 1;

export function ErrorToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [history, setHistory] = useState<Toast[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dismissedIdsRef = useRef<Set<string>>(new Set());

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
    setToasts((prev) => {
      // Find the dismissed toast to add to history
      const dismissed = prev.find((t) => t.id === id);
      if (dismissed && !dismissedIdsRef.current.has(id)) {
        dismissedIdsRef.current.add(id);
        setHistory((h) => {
          const next = [{ ...dismissed, id: `hist-${Date.now()}` }, ...h];
          return next.slice(0, MAX_HISTORY);
        });
        setUnreadCount((c) => c + 1);
      }
      return prev.filter((t) => t.id !== id);
    });
  }, []);

  const markAllRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setUnreadCount(0);
    dismissedIdsRef.current.clear();
  }, []);

  // Clear stale dismissed IDs on history clear
  return (
    <ErrorToastContext.Provider
      value={{ toasts, addToast, dismissToast, history, unreadCount, markAllRead, clearHistory }}
    >
      {children}
    </ErrorToastContext.Provider>
  );
}
