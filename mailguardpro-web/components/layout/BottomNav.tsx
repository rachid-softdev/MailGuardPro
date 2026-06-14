"use client";

import { CheckCircle, Clock, LayoutDashboard, Settings, Upload } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/validate", label: "Validate", Icon: CheckCircle },
  { href: "/bulk", label: "Bulk", Icon: Upload },
  { href: "/history", label: "History", Icon: Clock },
  { href: "/settings", label: "Settings", Icon: Settings },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[var(--bg-surface)] border-t border-[var(--border)]"
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-around h-14 px-2">
        {navItems.map(({ href, label, Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-md text-[10px] font-medium transition-colors min-w-0 ${
                isActive
                  ? "text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={18} aria-hidden="true" />
              <span className="truncate max-w-full">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
