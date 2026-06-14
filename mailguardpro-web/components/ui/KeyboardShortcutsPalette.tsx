"use client";

import { Command } from "lucide-react";
import { useEffect, useRef } from "react";

interface ShortcutItem {
  key: string;
  label: string;
  description: string;
}

interface KeyboardShortcutsPaletteProps {
  shortcuts: ShortcutItem[];
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsPalette({
  shortcuts,
  isOpen,
  onClose,
}: KeyboardShortcutsPaletteProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Small delay to avoid the same `?` keypress closing immediately
    const timer = setTimeout(() => {
      document.addEventListener("keydown", handleKey);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      panelRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="relative bg-[var(--bg-surface)] border border-[var(--border)] rounded-[var(--radius-xl)] shadow-[var(--shadow-xl)] w-full max-w-md mx-4 overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Command className="w-4 h-4 text-[var(--text-muted)]" />
            <h2 className="font-display font-semibold">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Close shortcuts"
          >
            Esc
          </button>
        </div>

        <div className="p-2">
          {shortcuts.map((shortcut) => (
            <div
              key={shortcut.key}
              className="flex items-center justify-between px-3 py-2.5 rounded-[var(--radius-md)] hover:bg-[var(--bg-elevated)] transition-colors"
            >
              <span className="text-sm text-[var(--text-primary)]">{shortcut.description}</span>
              <kbd className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 text-xs font-mono font-medium bg-[var(--bg-subtle)] border border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--text-secondary)]">
                {shortcut.label}
              </kbd>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-elevated)]">
          <p className="text-xs text-[var(--text-muted)]">
            Press <kbd className="font-mono font-medium text-[var(--text-secondary)]">?</kbd> to
            toggle this panel at any time.
          </p>
        </div>
      </div>
    </div>
  );
}
