"use client";

import { AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface ErrorToastProps {
  id: string;
  type: "error" | "warning" | "info";
  title: string;
  message: string;
  onRetry?: () => void;
  onDismiss: (id: string) => void;
}

const typeConfig = {
  error: {
    icon: AlertCircle,
    bg: "var(--status-invalid-bg)",
    border: "var(--status-invalid)",
    text: "var(--status-invalid)",
    autoDismissMs: null, // stays until dismissed
  },
  warning: {
    icon: AlertTriangle,
    bg: "var(--status-risky-bg)",
    border: "var(--status-risky)",
    text: "var(--status-risky)",
    autoDismissMs: 6000,
  },
  info: {
    icon: Info,
    bg: "#eff6ff",
    border: "#3b82f6",
    text: "#3b82f6",
    autoDismissMs: 6000,
  },
} as const;

export function ErrorToast({ id, type, title, message, onRetry, onDismiss }: ErrorToastProps) {
  const [exiting, setExiting] = useState(false);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const config = typeConfig[type];
  const Icon = config.icon;
  const autoDismissMs = config.autoDismissMs;

  // Slide-in on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => {
      cancelAnimationFrame(frame);
      mountedRef.current = false;
    };
  }, []);

  // Auto-dismiss for non-error variants
  useEffect(() => {
    if (autoDismissMs === null) return;

    timerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      setExiting(true);
      setTimeout(() => {
        if (!mountedRef.current) return;
        onDismiss(id);
      }, 200);
    }, autoDismissMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [autoDismissMs, id, onDismiss]);

  const handleDismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setExiting(true);
    setTimeout(() => {
      if (!mountedRef.current) return;
      onDismiss(id);
    }, 200);
  }, [id, onDismiss]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`
        flex items-start gap-3 px-4 py-3
        border rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)]
        transition-all duration-300 ease-in-out max-w-sm w-full
        motion-reduce:transition-none
        ${visible && !exiting ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"}
      `}
      style={{
        backgroundColor: config.bg,
        borderColor: config.border,
      }}
    >
      <Icon className="w-5 h-5 shrink-0 mt-0.5" style={{ color: config.text }} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </p>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          {message}
        </p>
        {onRetry && (
          <button
            onClick={() => {
              onRetry();
              handleDismiss();
            }}
            className="text-xs font-semibold mt-2 hover:underline"
            style={{ color: config.text }}
          >
            Retry
          </button>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 p-0.5 rounded-md hover:opacity-70 transition-opacity"
        style={{ color: "var(--text-muted)" }}
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
