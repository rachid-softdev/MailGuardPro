"use client";

import { AlertCircle, AlertTriangle, Bell, BellDot, Info } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useErrorToast } from "@/hooks/useErrorToast";
import { cn } from "@/lib/cn";

const ICON_MAP = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

interface NotificationBellProps {
  direction?: "up" | "down";
}

export function NotificationBell({ direction = "up" }: NotificationBellProps) {
  const { history, unreadCount, markAllRead, clearHistory } = useErrorToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleToggle = useCallback(() => {
    setOpen((prev) => {
      if (!prev) {
        markAllRead();
      }
      return !prev;
    });
  }, [markAllRead]);

  useEffect(() => {
    if (!open) return;
    const handleEvent = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOpen(false);
        return;
      }
      if (ref.current && !ref.current.contains(event.target as Node)) {
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
        type="button"
        onClick={handleToggle}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--ink-3)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={open}
      >
        {unreadCount > 0 ? <BellDot size={16} /> : <Bell size={16} />}
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center bg-[var(--status-invalid)] px-0.5 font-mono text-[8px] font-semibold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            "absolute right-0 z-50 max-h-80 w-80 overflow-y-auto border border-[var(--line-strong)] bg-[var(--surface)] shadow-[var(--shadow-lg)]",
            direction === "down" ? "top-full mt-2" : "bottom-full mb-2",
          )}
          role="menu"
          aria-label="Notification history"
        >
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-2)]">
              Notifications
            </h3>
            {history.length > 0 && (
              <button
                type="button"
                onClick={clearHistory}
                className="text-[10px] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
              >
                Clear all
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-[var(--ink-3)]">
              No recent notifications
            </p>
          ) : (
            <div className="divide-y divide-[var(--line)]">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="px-4 py-2.5 transition-colors hover:bg-[var(--surface-2)]"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0" aria-hidden="true">
                      {(() => {
                        const Icon = ICON_MAP[item.type];
                        return <Icon className="h-3.5 w-3.5 text-[var(--ink-3)]" />;
                      })()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-[var(--ink)]">{item.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-[var(--ink-2)]">
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
