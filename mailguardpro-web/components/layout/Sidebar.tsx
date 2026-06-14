"use client";

import {
  CheckCircle,
  Clock,
  KeyRound,
  LayoutDashboard,
  Settings,
  Shield,
  Upload,
  Webhook,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Tooltip } from "@/components/ui/Tooltip";
import { signOutAction } from "./actions";

interface SidebarProps {
  credits: number;
  onClose?: () => void;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/validate", label: "Validate", Icon: CheckCircle },
  { href: "/bulk", label: "Bulk", Icon: Upload },
  { href: "/history", label: "History", Icon: Clock },
  { href: "/api-keys", label: "API Keys", Icon: KeyRound },
  { href: "/webhooks", label: "Webhooks", Icon: Webhook },
  { href: "/admin", label: "Admin", Icon: Shield },
  { href: "/settings", label: "Settings", Icon: Settings },
] as const;

export function Sidebar({ credits, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[var(--accent)] rounded-lg" />
          <span className="font-display font-bold">MailGuard</span>
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        )}
      </div>

      <nav className="p-4">
        {navItems.map(({ href, label, Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm mb-1 ${
                isActive
                  ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "hover:bg-[var(--bg-subtle)]"
              }`}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="absolute bottom-0 w-full p-4 border-t border-[var(--border)]">
        <div className="flex items-center justify-between text-sm">
          <div>
            <Tooltip
              content="Each validation consumes 1 credit. Credits reset monthly based on your plan."
              side="top"
            >
              <p className="text-[var(--text-muted)] cursor-help">Credits</p>
            </Tooltip>
            <p className="font-mono font-semibold">{credits}</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Tooltip content="Show keyboard shortcuts" side="top" shortcut="?">
              <span className="text-xs text-[var(--text-muted)] tracking-wide cursor-help">
                <kbd className="font-mono text-[10px] bg-[var(--bg-subtle)] px-1 py-0.5 rounded border border-[var(--border)]">
                  ?
                </kbd>{" "}
                shortcuts
              </span>
            </Tooltip>
            <form action={signOutAction}>
              <button className="btn btn-ghost btn-sm">Sign out</button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
