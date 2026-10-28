"use client";

import { useMemo, useState } from "react";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { ErrorToastContainer } from "@/components/ui/ErrorToastContainer";
import { KeyboardShortcutsPalette } from "@/components/ui/KeyboardShortcutsPalette";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { UndoHistoryListener } from "@/components/undo/UndoHistoryListener";
import { UndoProvider } from "@/components/undo/UndoProvider";
import { UndoToastContainer } from "@/components/undo/UndoToastContainer";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { UndoHistoryProvider } from "@/hooks/useUndoHistory";
import { BottomNav } from "./BottomNav";
import { DashboardTopbar } from "./DashboardTopbar";
import { Sidebar } from "./Sidebar";

interface DashboardShellProps {
  credits: number;
  plan: string;
  children: React.ReactNode;
}

export function DashboardShell({ credits, plan, children }: DashboardShellProps) {
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
      <div className="min-h-screen bg-[var(--bg)]">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded-[var(--radius-sm)] focus:border focus:border-[var(--line)] focus:bg-[var(--surface)] focus:px-4 focus:py-2 focus:text-[var(--ink)]"
        >
          Skip to main content
        </a>

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-[var(--overlay)] md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        <aside
          className={`fixed z-40 h-full w-[var(--sidebar-width)] border-r border-[var(--line)] bg-[var(--surface)] transition-transform duration-200 ease-[var(--ease-out-quart)] md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar credits={credits} plan={plan} onClose={() => setSidebarOpen(false)} />
        </aside>

        <div className="flex min-h-screen flex-col md:ml-[var(--sidebar-width)]">
          <DashboardTopbar
            onOpenMenu={() => setSidebarOpen(true)}
            onOpenSearch={() => setShowCommandPalette(true)}
          />

          <main id="main-content" className="flex-1 pb-16 md:pb-0">
            <OfflineBanner />
            <UndoProvider>
              {children}
              <UndoToastContainer />
            </UndoProvider>
          </main>
        </div>

        <BottomNav />
        <CommandPalette isOpen={showCommandPalette} onClose={() => setShowCommandPalette(false)} />
        <UndoHistoryListener />
        <KeyboardShortcutsPalette
          shortcuts={shortcuts}
          isOpen={showPalette}
          onClose={() => setShowPalette(false)}
        />
        <ErrorToastContainer />
      </div>
    </UndoHistoryProvider>
  );
}
