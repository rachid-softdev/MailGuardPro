"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UndoToastItem } from "./types";

interface UndoToastProps {
  item: UndoToastItem;
  onDismiss: (id: string) => void;
}

export function UndoToast({ item, onDismiss }: UndoToastProps) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(
    undefined as unknown as ReturnType<typeof setTimeout>,
  );
  const mountedRef = useRef<boolean>(true);

  const handleExpire = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      if (!mountedRef.current) return;
      item.onExpire();
      onDismiss(item.id);
    }, 200);
  }, [item, onDismiss]);

  const handleAction = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    void Promise.resolve(item.onAction()).finally(() => {
      onDismiss(item.id);
    });
  }, [item, onDismiss]);

  useEffect(() => {
    mountedRef.current = true;
    const remaining = item.expiresAt.getTime() - Date.now();

    if (remaining <= 0) {
      handleExpire();
      return;
    }

    timerRef.current = setTimeout(handleExpire, remaining);

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [handleExpire, item.expiresAt]);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] transition-all duration-200 ${
        exiting ? "translate-x-full opacity-0" : "translate-x-0 opacity-100"
      }`}
      role="alert"
      aria-live="polite"
    >
      <p className="text-sm text-[var(--text-primary)] flex-1 min-w-0">{item.message}</p>
      <button
        onClick={handleAction}
        className="text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors whitespace-nowrap"
      >
        {item.actionLabel}
      </button>
    </div>
  );
}
