"use client";

import { AlertCircle, AlertTriangle, Bell, BellDot, Info } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useErrorToast } from "@/hooks/useErrorToast";

const ICON_MAP = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

export function NotificationBell() {
  const { history, unreadCount, markAllRead, clearHistory } = useErrorToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleToggle = useCallback(() => {
    setOpen((prev) => {
      if (!prev) {
        // Opening — mark as read
        markAllRead();
      }
      return !prev;
    });
  }, [markAllRead]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const handleEvent = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") setOpen(false);
        return;
      }
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleEvent);
    document.addEventListener("keydown", handleEvent);
    return () => {
      document.removeEventListener("mousedown", handleEvent);
      document.removeEventListener("keydown", handleEvent);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleToggle}
        className="relative p-1.5 rounded-md hover:bg-[var(--bg-subtle)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={open}
      >
        {unreadCount > 0 ? <BellDot size={18} /> : <Bell size={18} />}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[var(--status-invalid)] text-white text-[10px] font-semibold flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute bottom-full right-0 mb-2 w-80 max-h-80 overflow-y-auto bg-[var(--bg-surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] z-50 animate-fade-slide-in"
          role="menu"
          aria-label="Notification history"
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)]">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Notifications</h3>
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--text-muted)] text-center">
              No recent notifications
            </p>
          ) : (
            <div className="py-1">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="px-4 py-2.5 hover:bg-[var(--bg-subtle)] transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0" aria-hidden="true">
                      {(() => {
                        const Icon = ICON_MAP[item.type];
                        return <Icon className="w-4 h-4 text-[var(--text-muted)]" />;
                      })()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {item.title}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mt-0.5">
                        {item.message}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
