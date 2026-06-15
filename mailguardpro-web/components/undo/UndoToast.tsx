"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UndoToastItem } from "./types";

interface UndoToastProps {
  item: UndoToastItem;
  onDismiss: (id: string) => void;
}

export function UndoToast({ item, onDismiss }: UndoToastProps) {
  const [exiting, setExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(
    undefined as unknown as ReturnType<typeof setTimeout>,
  );
  const animRef = useRef<number>(0);
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
    cancelAnimationFrame(animRef.current);
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

    // Countdown progress animation
    const start = Date.now();
    const duration = remaining;
    const tick = () => {
      if (!mountedRef.current) return;
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(pct);
      if (pct > 0) {
        animRef.current = requestAnimationFrame(tick);
      }
    };
    animRef.current = requestAnimationFrame(tick);

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      cancelAnimationFrame(animRef.current);
    };
  }, [handleExpire, item.expiresAt]);

  return (
    <div
      className={`relative flex items-center gap-3 px-4 py-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] transition-all duration-200 ${
        exiting ? "translate-x-full opacity-0" : "translate-x-0 opacity-100"
      }`}
      role="alert"
      aria-live="polite"
    >
      {/* Progress bar */}
      <div
        className="absolute bottom-0 left-0 h-0.5 bg-[var(--accent)] rounded-full transition-none"
        style={{ width: `${progress}%` }}
        aria-hidden="true"
      />
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
