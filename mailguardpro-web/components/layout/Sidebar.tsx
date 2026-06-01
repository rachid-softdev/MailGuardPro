"use client";

import {
  CheckCircle,
  Clock,
  KeyRound,
  LayoutDashboard,
  Settings,
  Upload,
  Webhook,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarProps {
  credits: number;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/validate", label: "Validate", Icon: CheckCircle },
  { href: "/bulk", label: "Bulk", Icon: Upload },
  { href: "/history", label: "History", Icon: Clock },
  { href: "/api-keys", label: "API Keys", Icon: KeyRound },
  { href: "/webhooks", label: "Webhooks", Icon: Webhook },
  { href: "/settings", label: "Settings", Icon: Settings },
] as const;

export function Sidebar({ credits }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      <div className="p-4 border-b border-[var(--border)]">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[var(--accent)] rounded-lg" />
          <span className="font-display font-bold">MailGuard</span>
        </Link>
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
                  ? "bg-[var(--accent)] bg-opacity-10 text-[var(--accent)]"
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
            <p className="text-[var(--text-muted)]">Credits</p>
            <p className="font-mono font-semibold">{credits}</p>
          </div>
          <form
            action={async () => {
              "use server";
              const { signOut } = await import("@/lib/auth");
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="btn btn-ghost btn-sm">Sign out</button>
          </form>
        </div>
      </div>
    </>
  );
}
