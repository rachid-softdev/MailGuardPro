"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { Sidebar } from "./Sidebar";

interface DashboardShellProps {
  credits: number;
  children: React.ReactNode;
}

export function DashboardShell({ credits, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
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

      {/* Main content */}
      <main id="main-content" className="flex-1 ml-0 md:ml-[var(--sidebar-width)]">
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
        {children}
      </main>
    </div>
  );
}
