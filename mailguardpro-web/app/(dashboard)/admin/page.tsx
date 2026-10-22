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
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button, Card } from "@/components/ui";

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

function PlanBadge({ plan }: { plan: string }) {
  return <span className="stamp stamp-idle">{plan}</span>;
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="stamp stamp-pass">
      <span className="h-1 w-1 rounded-full bg-[var(--status-valid)]" aria-hidden="true" />
      Active
    </span>
  ) : (
    <span className="stamp stamp-idle">
      <span className="h-1 w-1 rounded-full bg-[var(--ink-3)]" aria-hidden="true" />
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
    <Card
      variant="default"
      padding="md"
      className="border-t-2"
      style={{ borderTopColor: accentColor }}
    >
      <div className="mb-1 flex items-start justify-between">
        <p className="label-mono">{label}</p>
        <span className="text-[var(--ink-3)]" aria-hidden="true">
          {icon}
        </span>
      </div>
      <p className="mt-2 font-display text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
        {value}
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function StatCardSkeleton() {
  return (
    <Card variant="default" padding="md">
      <div className="h-3 w-20 bg-[var(--surface-3)] animate-skeleton mb-3" />
      <div className="h-8 w-16 bg-[var(--surface-3)] animate-skeleton" />
    </Card>
  );
}

function TableRowSkeleton({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-4 py-3 px-4 border-b border-[var(--line)] last:border-0">
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="h-3 flex-1 animate-skeleton bg-[var(--surface-3)]" />
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
      <span className="mb-4 flex h-12 w-12 items-center justify-center border border-[var(--status-invalid)]/40 bg-[var(--status-invalid-bg)]">
        <ShieldAlert className="h-5 w-5 text-[var(--status-invalid-text)]" aria-hidden="true" />
      </span>
      <h2 className="mb-2 font-display text-xl font-semibold tracking-[-0.02em] text-[var(--ink)]">
        Access denied
      </h2>
      <p className="mb-1 text-[13px] text-[var(--ink-2)]">
        You do not have permission to view this page.
      </p>
      <p className="text-[12px] text-[var(--ink-3)]">
        Only users with the admin role can open this register.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error banner
// ---------------------------------------------------------------------------

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mb-6 flex items-center justify-between border border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] px-4 py-3 text-[13px] text-[var(--status-invalid-text)]">
      <span>{message}</span>
      <Button onClick={onRetry} variant="ghost" size="sm">
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        Retry
      </Button>
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
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            eyebrow="Operations / admin"
            title="Admin."
            description="System-wide overview and user management."
          />
          <AccessDenied />
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            eyebrow="Operations / admin"
            title="Admin."
            description="System-wide overview and user management."
          />

          {/* Stat card skeletons */}
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>

          {/* Plan distribution skeleton */}
          <Card variant="default" padding="md" className="mb-6">
            <div className="mb-4 h-3 w-32 animate-skeleton" />
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-3 w-20 animate-skeleton" />
                  <div className="h-2 flex-1 animate-skeleton" />
                  <div className="h-3 w-8 animate-skeleton" />
                </div>
              ))}
            </div>
          </Card>

          {/* Recent users skeleton */}
          <Card variant="default" padding="md">
            <div className="mb-4 h-3 w-32 animate-skeleton" />
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRowSkeleton key={i} cols={4} />
            ))}
          </Card>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------
  if (error) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            eyebrow="Operations / admin"
            title="Admin."
            description="System-wide overview and user management."
          />
          <ErrorBanner message={error} onRetry={fetchStats} />
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Empty state (shouldn't happen in practice, but handle gracefully)
  // -----------------------------------------------------------------------
  if (!stats) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            eyebrow="Operations / admin"
            title="Admin."
            description="System-wide overview and user management."
          />
          <div className="flex flex-col items-center justify-center py-24 text-[var(--ink-3)]">
            <p className="text-base">No data available.</p>
            <Button onClick={fetchStats} variant="ghost" className="mt-4">
              <RefreshCw size={14} className="mr-2" aria-hidden="true" />
              Reload
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Normal render
  // -----------------------------------------------------------------------
  const maxPlanCount = Math.max(...stats.usersByPlan.map((p) => p.count), 1);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          eyebrow="Operations / admin"
          title="Admin."
          description="System-wide overview and user management. Numbers are read directly from the register."
          actions={
            <Button onClick={fetchStats} variant="ghost" size="sm">
              <RefreshCw size={13} aria-hidden="true" />
              Refresh
            </Button>
          }
          meta={
            <>
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                {stats.totalUsers.toLocaleString()} users
              </span>
              <span className="h-3 w-px bg-[var(--line)]" aria-hidden="true" />
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                {stats.totalValidations.toLocaleString()} validations
              </span>
              <span className="h-3 w-px bg-[var(--line)]" aria-hidden="true" />
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                {stats.activeWebhooks} webhooks live
              </span>
            </>
          }
        />

        {/* Stats cards */}
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
          <Card variant="default" padding="md">
            <h2 className="text-lg font-display font-semibold mb-4">Users by Plan</h2>
            {stats.usersByPlan.length > 0 ? (
              <div className="space-y-3">
                {stats.usersByPlan.map((entry) => (
                  <div key={entry.plan} className="flex items-center gap-3">
                    <PlanBadge plan={entry.plan} />
                    <div className="h-2 flex-1 bg-[var(--surface-3)]">
                      <div
                        className="h-full bg-[var(--accent)] transition-all duration-500"
                        style={{ width: `${(entry.count / maxPlanCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono font-semibold text-[var(--ink-2)] w-8 text-right">
                      {entry.count}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--ink-3)]">No user data available.</p>
            )}
          </Card>

          {/* Quick stats */}
          <Card variant="default" padding="md">
            <h2 className="text-lg font-display font-semibold mb-4">System Overview</h2>
            <div className="space-y-3">
              <StatRow label="Bulk Jobs" value={stats.totalBulkJobs} />
              <StatRow label="API Keys" value={stats.totalApiKeys} />
              <StatRow label="Active Webhooks" value={stats.activeWebhooks} />
              <StatRow label="Total Users" value={stats.totalUsers} />
              <StatRow label="Active Users" value={stats.activeUsers} />
            </div>
          </Card>
        </div>

        {/* Recent Users */}
        <Card variant="default" padding="md">
          <h2 className="text-lg font-display font-semibold mb-4">Recent Users</h2>
          {stats.recentUsers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr className="border-b border-[var(--line)]">
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--ink-3)]">
                      Name
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--ink-3)]">
                      Email
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--ink-3)]">
                      Plan
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--ink-3)]">
                      Created
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--ink-3)]">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--surface-2)] transition-colors"
                    >
                      <td className="py-3 px-4 text-sm font-medium">{user.name || "—"}</td>
                      <td className="py-3 px-4 text-sm font-mono text-[var(--ink-2)]">
                        {user.email}
                      </td>
                      <td className="py-3 px-4">
                        <PlanBadge plan={user.plan} />
                      </td>
                      <td className="py-3 px-4 text-sm text-[var(--ink-3)]">
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
            <p className="text-sm text-[var(--ink-3)]">No users found.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline helper: a key-value row for the system overview card
// ---------------------------------------------------------------------------

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[var(--line)] last:border-0">
      <span className="text-sm text-[var(--ink-2)]">{label}</span>
      <span className="text-sm font-mono font-semibold">{value}</span>
    </div>
  );
}
