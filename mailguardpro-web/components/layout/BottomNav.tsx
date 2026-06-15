"use client";

import { CheckCircle, Clock, KeyRound, LayoutDashboard, Settings, Upload } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/validate", label: "Validate", Icon: CheckCircle },
  { href: "/bulk", label: "Bulk", Icon: Upload },
  { href: "/history", label: "History", Icon: Clock },
  { href: "/api-keys", label: "API Keys", Icon: KeyRound },
  { href: "/settings", label: "Settings", Icon: Settings },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[var(--bg-surface)] border-t border-[var(--border)] pb-[max(8px,env(safe-area-inset-bottom))]"
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-evenly h-14 px-1 overflow-x-auto gap-0">
        {navItems.map(({ href, label, Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex flex-col items-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-medium min-w-[44px] min-h-[44px] justify-center active:scale-95 transition ${
                isActive
                  ? "text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              {/* Active indicator: accent bar above the icon, animated with scale */}
              <span
                className={`absolute -top-1 left-1/2 -translate-x-1/2 w-[18px] h-[2px] rounded-full bg-[var(--accent)] transition-transform duration-200 ${
                  isActive ? "scale-x-100" : "scale-x-0"
                }`}
                aria-hidden="true"
              />
              {/* Icon wrapper keeps badge position context */}
              <span className="relative">
                {/*
                // Badge support — pass a `badge` prop and uncomment when dynamic data is available:
                // badge != null && badge > 0 && (
                //   <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                //     {badge > 99 ? "99+" : badge}
                //   </span>
                // )
                */}
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className="truncate max-w-full">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
