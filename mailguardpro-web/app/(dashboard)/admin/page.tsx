"use client";

import { formatDistanceToNow } from "date-fns";
import {
  BarChart3,
  CheckCircle,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  Users,
  Webhook,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlanDistribution {
  plan: string;
  count: number;
}

interface RecentUser {
  id: string;
  name: string | null;
  email: string;
  plan: string;
  isActive: boolean;
  createdAt: string;
}

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalValidations: number;
  validationsToday: number;
  totalBulkJobs: number;
  activeWebhooks: number;
  totalApiKeys: number;
  usersByPlan: PlanDistribution[];
  recentUsers: RecentUser[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const planColors: Record<string, string> = {
  FREE: "bg-zinc-500/20 text-zinc-400",
  STARTER: "bg-blue-500/20 text-blue-400",
  GROWTH: "bg-violet-500/20 text-violet-400",
  SCALE: "bg-amber-500/20 text-amber-400",
  ENTERPRISE: "bg-emerald-500/20 text-emerald-400",
};

function PlanBadge({ plan }: { plan: string }) {
  const colorClass = planColors[plan] || "bg-zinc-500/20 text-zinc-400";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-mono font-semibold uppercase  ${colorClass}`}
    >
      {plan}
    </span>
  );
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono uppercase  text-[var(--status-valid)] bg-[var(--status-valid-bg)]">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-valid)]" />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono uppercase  text-[var(--text-muted)] bg-[var(--bg-subtle)]">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
      Inactive
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accentColor?: string;
}

function StatCard({ icon, label, value, accentColor = "var(--accent)" }: StatCardProps) {
  return (
    <div className="card border-t-2" style={{ borderTopColor: accentColor }}>
      <div className="flex items-start justify-between mb-1">
        <p className="text-xs text-[var(--text-muted)] uppercase ">{label}</p>
        <span className="text-[var(--text-muted)]" aria-hidden="true">
          {icon}
        </span>
      </div>
      <p className="text-3xl font-display font-bold">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function StatCardSkeleton() {
  return (
    <div className="card">
      <div className="h-3 w-20 bg-[var(--bg-subtle)] animate-skeleton rounded mb-3" />
      <div className="h-8 w-16 bg-[var(--bg-subtle)] animate-skeleton rounded" />
    </div>
  );
}

function TableRowSkeleton({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-4 py-3 px-4 border-b border-[var(--border)] last:border-0">
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="h-4 bg-[var(--bg-subtle)] animate-skeleton rounded flex-1" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Access Denied
// ---------------------------------------------------------------------------

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-full bg-[var(--status-invalid)]/10 flex items-center justify-center mb-4">
        <ShieldAlert className="w-8 h-8 text-[var(--status-invalid)]" aria-hidden="true" />
      </div>
      <h2 className="text-xl font-display font-bold mb-2">Access Denied</h2>
      <p className="text-[var(--text-secondary)] mb-1">
        You do not have permission to view this page.
      </p>
      <p className="text-sm text-[var(--text-muted)]">
        Only users with the Admin role can access the admin dashboard.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error banner
// ---------------------------------------------------------------------------

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mb-6 px-4 py-3 rounded-lg bg-[var(--status-invalid)]/10 border border-[var(--status-invalid)]/30 text-sm text-[var(--status-invalid)] flex items-center justify-between">
      <span>{message}</span>
      <button onClick={onRetry} className="btn btn-ghost btn-sm">
        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
        Retry
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAccessDenied(false);

    try {
      const res = await fetch("/api/v1/admin/stats");

      if (res.status === 403) {
        setAccessDenied(true);
        return;
      }

      if (res.ok) {
        const json = await res.json();
        setStats(json.data);
      } else {
        setError("Failed to load admin stats. Please try again.");
      }
    } catch {
      setError("Could not connect to server. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // -----------------------------------------------------------------------
  // Access denied
  // -----------------------------------------------------------------------
  if (accessDenied) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold mb-2">Admin</h1>
          <p className="text-[var(--text-secondary)]">Administration dashboard</p>
        </div>
        <AccessDenied />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <div className="h-8 w-40 bg-[var(--bg-subtle)] animate-skeleton rounded mb-2" />
          <div className="h-4 w-56 bg-[var(--bg-subtle)] animate-skeleton rounded" />
        </div>

        {/* Stat card skeletons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>

        {/* Plan distribution skeleton */}
        <div className="card mb-8">
          <div className="h-5 w-40 bg-[var(--bg-subtle)] animate-skeleton rounded mb-4" />
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-4 w-20 bg-[var(--bg-subtle)] animate-skeleton rounded" />
                <div className="flex-1 h-4 bg-[var(--bg-subtle)] animate-skeleton rounded" />
                <div className="h-4 w-8 bg-[var(--bg-subtle)] animate-skeleton rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Recent users skeleton */}
        <div className="card">
          <div className="h-5 w-40 bg-[var(--bg-subtle)] animate-skeleton rounded mb-4" />
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRowSkeleton key={i} cols={4} />
          ))}
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------
  if (error) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold mb-2">Admin</h1>
          <p className="text-[var(--text-secondary)]">Administration dashboard</p>
        </div>
        <ErrorBanner message={error} onRetry={fetchStats} />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Empty state (shouldn't happen in practice, but handle gracefully)
  // -----------------------------------------------------------------------
  if (!stats) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold mb-2">Admin</h1>
          <p className="text-[var(--text-secondary)]">Administration dashboard</p>
        </div>
        <div className="flex flex-col items-center justify-center py-24 text-[var(--text-muted)]">
          <p className="text-base">No data available.</p>
          <button onClick={fetchStats} className="btn btn-ghost mt-4">
            <RefreshCw className="w-4 h-4 mr-2" />
            Reload
          </button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Normal render
  // -----------------------------------------------------------------------
  const maxPlanCount = Math.max(...stats.usersByPlan.map((p) => p.count), 1);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold mb-2">Admin</h1>
        <p className="text-[var(--text-secondary)]">System-wide overview and user management</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard icon={<Users size={18} />} label="Total Users" value={stats.totalUsers} />
        <StatCard
          icon={<UserCheck size={18} />}
          label="Active Users"
          value={stats.activeUsers}
          accentColor="var(--status-valid)"
        />
        <StatCard
          icon={<CheckCircle size={18} />}
          label="Validations Today"
          value={stats.validationsToday}
          accentColor="var(--accent)"
        />
        <StatCard
          icon={<BarChart3 size={18} />}
          label="Total Validations"
          value={stats.totalValidations}
          accentColor="var(--status-risky)"
        />
        <StatCard
          icon={<Webhook size={18} />}
          label="Active Webhooks"
          value={stats.activeWebhooks}
          accentColor="var(--status-unknown)"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Users by Plan */}
        <div className="card">
          <h2 className="text-lg font-display font-semibold mb-4">Users by Plan</h2>
          {stats.usersByPlan.length > 0 ? (
            <div className="space-y-3">
              {stats.usersByPlan.map((entry) => (
                <div key={entry.plan} className="flex items-center gap-3">
                  <PlanBadge plan={entry.plan} />
                  <div className="flex-1 h-5 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(entry.count / maxPlanCount) * 100}%`,
                        backgroundColor: "var(--accent)",
                      }}
                    />
                  </div>
                  <span className="text-sm font-mono font-semibold text-[var(--text-secondary)] w-8 text-right">
                    {entry.count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">No user data available.</p>
          )}
        </div>

        {/* Quick stats */}
        <div className="card">
          <h2 className="text-lg font-display font-semibold mb-4">System Overview</h2>
          <div className="space-y-3">
            <StatRow label="Bulk Jobs" value={stats.totalBulkJobs} />
            <StatRow label="API Keys" value={stats.totalApiKeys} />
            <StatRow label="Active Webhooks" value={stats.activeWebhooks} />
            <StatRow label="Total Users" value={stats.totalUsers} />
            <StatRow label="Active Users" value={stats.activeUsers} />
          </div>
        </div>
      </div>

      {/* Recent Users */}
      <div className="card">
        <h2 className="text-lg font-display font-semibold mb-4">Recent Users</h2>
        {stats.recentUsers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                    Name
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                    Email
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                    Plan
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                    Created
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.recentUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)] transition-colors"
                  >
                    <td className="py-3 px-4 text-sm font-medium">{user.name || "—"}</td>
                    <td className="py-3 px-4 text-sm font-mono text-[var(--text-secondary)]">
                      {user.email}
                    </td>
                    <td className="py-3 px-4">
                      <PlanBadge plan={user.plan} />
                    </td>
                    <td className="py-3 px-4 text-sm text-[var(--text-muted)]">
                      {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                    </td>
                    <td className="py-3 px-4">
                      <ActiveBadge isActive={user.isActive} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">No users found.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline helper: a key-value row for the system overview card
// ---------------------------------------------------------------------------

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[var(--border)] last:border-0">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      <span className="text-sm font-mono font-semibold">{value}</span>
    </div>
  );
}
