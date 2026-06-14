"use client";

import { Menu, Redo2, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { KeyboardShortcutsPalette } from "@/components/ui/KeyboardShortcutsPalette";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { UndoHistoryListener } from "@/components/undo/UndoHistoryListener";
import { UndoProvider } from "@/components/undo/UndoProvider";
import { UndoToastContainer } from "@/components/undo/UndoToastContainer";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { UndoHistoryProvider, useUndoHistory } from "@/hooks/useUndoHistory";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";

interface DashboardShellProps {
  credits: number;
  children: React.ReactNode;
}

/** Shows Ctrl+Z / Ctrl+Shift+Z hints in the sidebar footer */
function UndoHints() {
  const { canUndo, canRedo, nextUndoLabel, nextRedoLabel } = useUndoHistory();
  if (!canUndo && !canRedo) return null;
  return (
    <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] px-4 pb-2">
      {canUndo && (
        <span className="flex items-center gap-1">
          <Undo2 size={10} />
          {nextUndoLabel ?? "Undo"}
        </span>
      )}
      {canRedo && (
        <span className="flex items-center gap-1">
          <Redo2 size={10} />
          {nextRedoLabel ?? "Redo"}
        </span>
      )}
    </div>
  );
}

export function DashboardShell({ credits, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { showPalette, setShowPalette, showCommandPalette, setShowCommandPalette } =
    useKeyboardShortcuts();

  const shortcuts = useMemo(
    () => [
      { key: "d", label: "D", description: "Go to Dashboard" },
      { key: "v", label: "V", description: "Go to Validate" },
      { key: "b", label: "B", description: "Go to Bulk" },
      { key: "h", label: "H", description: "Go to History" },
      { key: "k", label: "K", description: "Go to API Keys" },
      { key: "w", label: "W", description: "Go to Webhooks" },
      { key: "s", label: "S", description: "Go to Settings" },
      { key: "/", label: "/", description: "Focus search or input" },
      { key: "?", label: "?", description: "Show keyboard shortcuts" },
    ],
    [],
  );

  return (
    <UndoHistoryProvider>
      <div className="min-h-screen bg-[var(--bg-base)] flex">
        {/* Skip to main content link */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:px-4 focus:py-2 focus:bg-[var(--bg-surface)] focus:text-[var(--text-primary)] focus:rounded-[var(--radius-md)] focus:shadow-[var(--shadow-lg)] focus:outline-2 focus:outline-[var(--border-focus)]"
        >
          Skip to main content
        </a>

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-[rgba(0,0,0,0.5)] z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar */}
        <aside
          className={`w-[var(--sidebar-width)] border-r border-[var(--border)] bg-[var(--bg-surface)] fixed h-full z-40 transition-transform duration-200 md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar credits={credits} onClose={() => setSidebarOpen(false)} />
        </aside>

        {/* Command palette */}
        <CommandPalette isOpen={showCommandPalette} onClose={() => setShowCommandPalette(false)} />

        {/* Undo / redo listener */}
        <UndoHistoryListener />

        {/* Undo / redo hints in sidebar */}
        <UndoHints />

        {/* Keyboard shortcuts palette */}
        <KeyboardShortcutsPalette
          shortcuts={shortcuts}
          isOpen={showPalette}
          onClose={() => setShowPalette(false)}
        />

        {/* Main content */}
        <main id="main-content" className="flex-1 ml-0 md:ml-[var(--sidebar-width)] pb-14 md:pb-0">
          {/* Mobile header with hamburger */}
          <div className="md:hidden flex items-center p-4 border-b border-[var(--border)] bg-[var(--bg-surface)]">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 -ml-2 text-[var(--text-primary)]"
              aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              <Menu size={24} />
            </button>
            <span className="ml-2 font-display font-bold">MailGuard</span>
          </div>
          <OfflineBanner />
          <UndoProvider>
            {children}
            <UndoToastContainer />
          </UndoProvider>
        </main>

        {/* Mobile bottom navigation */}
        <BottomNav />
      </div>
    </UndoHistoryProvider>
  );
}
