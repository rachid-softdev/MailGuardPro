"use client";

import {
  CheckCircle,
  Clock,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  Redo2,
  Settings,
  Shield,
  Undo2,
  Upload,
  Webhook,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand/BrandMark";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Tooltip } from "@/components/ui/Tooltip";
import { useUndoHistory } from "@/hooks/useUndoHistory";
import { cn } from "@/lib/cn";
import { signOutAction } from "./actions";

interface SidebarProps {
  credits: number;
  plan: string;
  onClose?: () => void;
}

const navGroups = [
  {
    label: "Inspect",
    items: [
      { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
      { href: "/validate", label: "Validate", Icon: CheckCircle },
    ],
  },
  {
    label: "Batches",
    items: [
      { href: "/bulk", label: "Bulk", Icon: Upload },
      { href: "/history", label: "History", Icon: Clock },
    ],
  },
  {
    label: "Connect",
    items: [
      { href: "/api-keys", label: "API keys", Icon: KeyRound },
      { href: "/webhooks", label: "Webhooks", Icon: Webhook },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/billing", label: "Billing", Icon: CreditCard },
      { href: "/settings", label: "Settings", Icon: Settings },
      { href: "/admin", label: "Admin", Icon: Shield },
    ],
  },
] as const;

function UndoHints() {
  const { canUndo, canRedo, nextUndoLabel, nextRedoLabel } = useUndoHistory();
  if (!canUndo && !canRedo) return null;

  return (
    <div className="mt-2 flex items-center gap-3 border-t border-[var(--line)] pt-2 font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
      {canUndo && (
        <span className="flex min-w-0 items-center gap-1">
          <Undo2 size={10} aria-hidden="true" />
          <span className="truncate">{nextUndoLabel ?? "Undo"}</span>
        </span>
      )}
      {canRedo && (
        <span className="flex min-w-0 items-center gap-1">
          <Redo2 size={10} aria-hidden="true" />
          <span className="truncate">{nextRedoLabel ?? "Redo"}</span>
        </span>
      )}
    </div>
  );
}

export function Sidebar({ credits, plan, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[var(--topbar-height)] shrink-0 items-center justify-between border-b border-[var(--line)] px-4">
        <Link href="/dashboard" aria-label="MailGuard Pro dashboard">
          <Wordmark />
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--ink-3)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] md:hidden"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Main navigation">
        {navGroups.map((group) => (
          <div key={group.label} className="pt-4">
            <p className="px-2 pb-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, Icon }) => {
                const isActive = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "relative flex h-9 items-center gap-2.5 rounded-[var(--radius-sm)] pl-4 pr-2.5 text-[13px] transition-colors",
                      isActive
                        ? "bg-[var(--surface-2)] font-medium text-[var(--ink)]"
                        : "text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute left-1.5 h-1 w-1",
                        isActive ? "bg-[var(--accent)]" : "bg-transparent",
                      )}
                      aria-hidden="true"
                    />
                    <Icon
                      size={15}
                      strokeWidth={isActive ? 2.1 : 1.8}
                      className={isActive ? "text-[var(--ink)]" : "text-[var(--ink-3)]"}
                      aria-hidden="true"
                    />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-[var(--line)] px-3 py-3">
        <div className="flex items-end justify-between gap-2 px-1">
          <div>
            <Tooltip
              content="Each validation consumes 1 credit. Credits reset monthly based on your plan."
              side="top"
            >
              <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
                Credits
              </p>
            </Tooltip>
            <p className="mt-0.5 font-mono text-lg leading-none text-[var(--ink)]">
              {plan === "BUSINESS" ? "Unlimited" : credits.toLocaleString("en-US")}
            </p>
          </div>
          <Link
            href="/billing"
            className="pb-0.5 text-[10px] font-medium text-[var(--ink-2)] underline decoration-[var(--line-strong)] underline-offset-2 hover:text-[var(--ink)]"
          >
            Top up
          </Link>
        </div>

        <UndoHints />
      </div>

      <div className="flex shrink-0 items-center justify-between gap-1 border-t border-[var(--line)] px-2 py-1.5">
        <div className="flex items-center gap-0.5">
          <ThemeToggle compact />
          <NotificationBell />
          <Tooltip content="Keyboard shortcuts" side="top" shortcut="?">
            <span className="inline-flex h-8 w-8 cursor-help items-center justify-center font-mono text-[10px] text-[var(--ink-3)]">
              ?
            </span>
          </Tooltip>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-[var(--radius-sm)] px-2 py-1.5 text-[11px] text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
