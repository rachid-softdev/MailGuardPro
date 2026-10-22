"use client";

import { CheckCircle, Clock, CreditCard, LayoutDashboard, Settings, Upload } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/validate", label: "Validate", Icon: CheckCircle },
  { href: "/bulk", label: "Bulk", Icon: Upload },
  { href: "/history", label: "History", Icon: Clock },
  { href: "/billing", label: "Billing", Icon: CreditCard },
  { href: "/settings", label: "Settings", Icon: Settings },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--line)] bg-[var(--surface)] pb-[max(6px,env(safe-area-inset-bottom))] md:hidden"
      aria-label="Main navigation"
    >
      <div className="flex h-14 items-center justify-evenly gap-0 overflow-x-auto px-1">
        {navItems.map(({ href, label, Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] px-1.5 py-1 text-[9px] font-medium transition-colors ${
                isActive ? "text-[var(--ink)]" : "text-[var(--ink-3)] hover:text-[var(--ink-2)]"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <span
                className={`absolute top-0 h-[2px] w-7 bg-[var(--accent)] transition-transform duration-150 ${
                  isActive ? "scale-x-100" : "scale-x-0"
                }`}
                aria-hidden="true"
              />
              <Icon
                size={17}
                strokeWidth={isActive ? 2.1 : 1.8}
                className={isActive ? "text-[var(--ink)]" : "text-[var(--ink-3)]"}
                aria-hidden="true"
              />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
