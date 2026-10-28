"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button, Input } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useUndoDelete } from "@/hooks/useUndoDelete";
import { logger } from "@/lib/logger";

interface User {
  id: string;
  name: string | null;
  email: string | null;
  plan: string;
  credits: number;
  createdAt: string;
}

interface SessionInfo {
  id: string;
  expires: string;
  isCurrent: boolean;
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Sessions (Security tab)
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [signingOutOthers, setSigningOutOthers] = useState(false);

  // Two-factor authentication (Security tab)
  const [twoFactor, setTwoFactor] = useState<{
    enabled: boolean;
    recoveryCodesRemaining: number;
  } | null>(null);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [twoFactorStep, setTwoFactorStep] = useState<"idle" | "setup" | "recovery" | "disable">(
    "idle",
  );
  const [twoFactorSetup, setTwoFactorSetup] = useState<{
    secret: string;
    otpauthUri: string;
  } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorRecoveryCodes, setTwoFactorRecoveryCodes] = useState<string[] | null>(null);
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [twoFactorMessage, setTwoFactorMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const { deleteResource } = useUndoDelete({
    deleteEndpoint: "/api/v1/user",
    restoreEndpoint: "/api/v1/user/account/restore",
    onRestored: () => {
      // Stay on settings page after undo
    },
    onExpired: () => {
      router.push("/");
    },
    getMessage: () => "Account deletion scheduled",
  });

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  // Tab state
  const [activeTab, setActiveTab] = useState("profile");

  useEffect(() => {
    fetchUser();
  }, []);

  // Auto-dismiss success messages after 4 seconds
  useEffect(() => {
    if (message?.type !== "success") return;

    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/v1/user/profile");
      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          setUser(data.data);
          setName(data.data.name || "");
          setEmail(data.data.email || "");
        }
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to fetch user");
      setMessage({ type: "error", text: "Failed to load profile data. Please refresh." });
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/v1/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Profile updated successfully!" });
      } else {
        const data = await res.json();
        setMessage({
          type: "error",
          text: data.error || "Failed to update profile",
        });
      }
    } catch {
      setMessage({
        type: "error",
        text: "Failed to save profile due to a network error. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const openStripePortal = async () => {
    try {
      const res = await fetch("/api/v1/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to open billing portal");
      setMessage({ type: "error", text: "Could not open billing portal. Please try again." });
    }
  };

  const deleteAccount = () => {
    setErrorMessage(null);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = () => {
    setDeleteConfirmOpen(false);
    setErrorMessage(null);
    void deleteResource("", { name: "Account" });
  };

  const fetchSessions = async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch("/api/v1/user/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data.data || []);
      } else {
        setMessage({ type: "error", text: "Failed to load active sessions." });
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to fetch sessions");
      setMessage({ type: "error", text: "Failed to load active sessions." });
    } finally {
      setSessionsLoading(false);
    }
  };

  const revokeSession = async (id: string) => {
    setRevokingSessionId(id);
    try {
      const res = await fetch(`/api/v1/user/sessions/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ type: "success", text: "Session revoked." });
        void fetchSessions();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to revoke session." });
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to revoke session");
      setMessage({ type: "error", text: "Failed to revoke session." });
    } finally {
      setRevokingSessionId(null);
    }
  };

  const signOutOtherDevices = async () => {
    setSigningOutOthers(true);
    try {
      const res = await fetch("/api/v1/user/sessions/revoke-others", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({
          type: "success",
          text:
            data.revokedCount > 0
              ? `Signed out ${data.revokedCount} other session(s).`
              : "No other active sessions.",
        });
        void fetchSessions();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to sign out other devices." });
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to sign out other devices");
      setMessage({ type: "error", text: "Failed to sign out other devices." });
    } finally {
      setSigningOutOthers(false);
    }
  };

  const fetchTwoFactorStatus = async () => {
    setTwoFactorLoading(true);
    try {
      const res = await fetch("/api/v1/user/2fa");
      if (res.ok) {
        const data = await res.json();
        if (data.data) setTwoFactor(data.data);
      } else {
        setTwoFactorMessage({ type: "error", text: "Failed to load two-factor status." });
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to fetch two-factor status");
      setTwoFactorMessage({ type: "error", text: "Failed to load two-factor status." });
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const startTwoFactorSetup = async () => {
    setTwoFactorBusy(true);
    setTwoFactorMessage(null);
    try {
      const res = await fetch("/api/v1/user/2fa/setup", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setTwoFactorSetup(data.data);
        setTwoFactorCode("");
        setTwoFactorStep("setup");
      } else {
        setTwoFactorMessage({ type: "error", text: data.error || "Failed to start setup." });
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to start two-factor setup");
      setTwoFactorMessage({ type: "error", text: "Failed to start setup." });
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const confirmTwoFactorEnable = async () => {
    setTwoFactorBusy(true);
    setTwoFactorMessage(null);
    try {
      const res = await fetch("/api/v1/user/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: twoFactorCode.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTwoFactorRecoveryCodes(data.data.recoveryCodes);
        setTwoFactor({ enabled: true, recoveryCodesRemaining: data.data.recoveryCodes.length });
        setTwoFactorStep("recovery");
      } else {
        setTwoFactorMessage({
          type: "error",
          text: data.error || "Failed to enable two-factor authentication.",
        });
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to enable two-factor authentication");
      setTwoFactorMessage({ type: "error", text: "Failed to enable two-factor authentication." });
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const confirmTwoFactorDisable = async () => {
    setTwoFactorBusy(true);
    setTwoFactorMessage(null);
    const entry = twoFactorCode.trim();
    const isRecoveryCode = entry.includes("-") || entry.length > 6;
    try {
      const res = await fetch("/api/v1/user/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isRecoveryCode ? { recoveryCode: entry } : { code: entry }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTwoFactor({ enabled: false, recoveryCodesRemaining: 0 });
        setTwoFactorStep("idle");
        setTwoFactorCode("");
        setTwoFactorMessage({ type: "success", text: "Two-factor authentication disabled." });
      } else {
        setTwoFactorMessage({
          type: "error",
          text: data.error || "Failed to disable two-factor authentication.",
        });
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to disable two-factor authentication");
      setTwoFactorMessage({ type: "error", text: "Failed to disable two-factor authentication." });
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const resetTwoFactorFlow = () => {
    setTwoFactorStep("idle");
    setTwoFactorCode("");
    setTwoFactorSetup(null);
    setTwoFactorRecoveryCodes(null);
    setTwoFactorMessage(null);
  };

  const copyRecoveryCodes = async () => {
    if (!twoFactorRecoveryCodes) return;
    try {
      await navigator.clipboard.writeText(twoFactorRecoveryCodes.join("\n"));
      setTwoFactorMessage({ type: "success", text: "Recovery codes copied to clipboard." });
    } catch {
      setTwoFactorMessage({
        type: "error",
        text: "Could not copy codes. Please copy them manually.",
      });
    }
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-4xl">
          <PageHeader
            eyebrow="Account / settings"
            title="Settings."
            description="Profile, plan, keys, and access."
          />
          <div className="mb-5 flex gap-1 border border-[var(--line-strong)] bg-[var(--surface)] p-0.5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 w-20 animate-skeleton" />
            ))}
          </div>
          <div className="border border-[var(--line-strong)] bg-[var(--surface)] p-5">
            <div className="space-y-4">
              <div className="h-3 w-32 animate-skeleton" />
              <div className="h-4 w-16 animate-skeleton" />
              <div className="h-10 w-full animate-skeleton" />
              <div className="h-4 w-16 animate-skeleton" />
              <div className="h-10 w-full animate-skeleton" />
              <div className="h-9 w-32 animate-skeleton" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          eyebrow="Account / settings"
          title="Settings."
          description="Profile, plan, keys, and access. Changes are written to the same register the rest of the app reads."
          meta={
            <>
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                {user?.email || "No email on file"}
              </span>
              <span className="h-3 w-px bg-[var(--line)]" aria-hidden="true" />
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                Plan / {user?.plan || "FREE"}
              </span>
            </>
          }
        />

        <div
          role="tablist"
          aria-label="Settings sections"
          className="mb-5 flex gap-0.5 overflow-x-auto border border-[var(--line-strong)] bg-[var(--surface)] p-0.5"
        >
          {[
            ["profile", "Profile"],
            ["billing", "Billing"],
            ["api", "API"],
            ["security", "Security"],
            ["danger", "Danger"],
          ].map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => {
                setActiveTab(id);
                if (id === "security" && sessions === null && !sessionsLoading) {
                  void fetchSessions();
                }
                if (id === "security" && twoFactor === null && !twoFactorLoading) {
                  void fetchTwoFactorStatus();
                }
              }}
              className={`h-8 shrink-0 px-3 font-mono text-[10px] uppercase tracking-[0.05em] transition-colors ${
                activeTab === id
                  ? "bg-[var(--ink)] text-[var(--bg)]"
                  : "text-[var(--ink-3)] hover:text-[var(--ink)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "profile" && (
          <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                Profile Information
              </h2>
              <p className="mt-1 text-[12px] text-[var(--ink-3)]">
                The name attached to your account and exports.
              </p>
            </div>

            <div className="p-5">
              {message && (
                <div
                  role="alert"
                  className={
                    message.type === "success"
                      ? "mb-5 border border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-3 text-[13px] text-[var(--ink-2)]"
                      : "mb-5 border border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] px-4 py-3 text-[13px] text-[var(--status-invalid-text)]"
                  }
                >
                  {message.text}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="settings-name"
                    className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-2)]"
                  >
                    Name
                  </label>
                  <input
                    id="settings-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input w-full"
                    placeholder="Your name"
                  />
                </div>

                <div>
                  <label
                    htmlFor="settings-email"
                    className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-2)]"
                  >
                    Email
                  </label>
                  <input
                    id="settings-email"
                    type="email"
                    value={email}
                    disabled
                    className="input w-full cursor-not-allowed bg-[var(--surface-2)] text-[var(--ink-3)]"
                  />
                  <p className="mt-1.5 text-[10px] text-[var(--ink-3)]">
                    Contact support to change your email address.
                  </p>
                </div>
              </div>

              <Button onClick={saveProfile} disabled={saving} variant="primary" className="mt-5">
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </section>
        )}

        {activeTab === "billing" && (
          <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                Billing & Subscription
              </h2>
              <p className="mt-1 text-[12px] text-[var(--ink-3)]">
                The plan and credits currently attached to this account.
              </p>
            </div>

            <div className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[var(--ink)]">Current Plan</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
                    {user?.plan === "FREE" ? "Free Plan" : user?.plan} ·{" "}
                    {user?.plan === "BUSINESS" ? "Unlimited" : user?.credits?.toLocaleString()}{" "}
                    credits remaining
                  </p>
                </div>
                <span className="stamp stamp-idle">{user?.plan || "FREE"}</span>
              </div>

              <Button onClick={openStripePortal} variant="primary" className="mt-5">
                Manage Billing
              </Button>

              <p className="mt-3 max-w-[58ch] text-[11px] leading-relaxed text-[var(--ink-3)]">
                Open the Stripe customer portal to update your payment method, view invoices, or
                change your subscription plan.
              </p>
            </div>
          </section>
        )}

        {activeTab === "api" && (
          <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                API Access
              </h2>
              <p className="mt-1 text-[12px] text-[var(--ink-3)]">
                Keys, scopes, and the route into the REST API.
              </p>
            </div>

            <div className="p-5">
              <p className="max-w-[58ch] text-[13px] leading-relaxed text-[var(--ink-2)]">
                Manage your API keys to access MailGuard Pro programmatically. Keys are shown once
                and can be revoked without rotating your integration.
              </p>

              <Button href="/api-keys" variant="primary" className="mt-5">
                Manage API Keys
              </Button>
            </div>
          </section>
        )}

        {activeTab === "security" && (
          <>
            <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
              <div className="border-b border-[var(--line)] px-5 py-4">
                <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                  Active Sessions
                </h2>
                <p className="mt-1 text-[12px] text-[var(--ink-3)]">
                  Devices currently signed in. Revoking a session signs that device out immediately.
                </p>
              </div>

              <div className="p-5">
                {message && (
                  <div
                    role="alert"
                    className={
                      message.type === "success"
                        ? "mb-4 border border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-3 text-[13px] text-[var(--ink-2)]"
                        : "mb-4 border border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] px-4 py-3 text-[13px] text-[var(--status-invalid-text)]"
                    }
                  >
                    {message.text}
                  </div>
                )}

                <p className="mb-4 text-[12px] leading-relaxed text-[var(--ink-3)]">
                  Sessions expire automatically after 30 days.
                </p>

                {sessionsLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-14 animate-skeleton border border-[var(--line)]" />
                    ))}
                  </div>
                ) : sessions && sessions.length > 0 ? (
                  <div className="border border-[var(--line)]">
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        className="flex flex-col gap-2 border-b border-[var(--line)] px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="flex items-center gap-2 text-[12px] font-medium text-[var(--ink)]">
                            Session {s.id.slice(0, 8)}
                            {s.isCurrent && <span className="stamp stamp-pass">This device</span>}
                          </p>
                          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
                            Expires {new Date(s.expires).toLocaleDateString()}
                          </p>
                        </div>
                        {!s.isCurrent && (
                          <Button
                            onClick={() => revokeSession(s.id)}
                            variant="ghost"
                            size="sm"
                            className="self-start text-[var(--status-invalid-text)] sm:self-auto"
                            disabled={revokingSessionId === s.id}
                          >
                            {revokingSessionId === s.id ? "Revoking..." : "Revoke"}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--ink-3)]">No active sessions found.</p>
                )}

                <Button
                  onClick={signOutOtherDevices}
                  variant="ghost"
                  disabled={signingOutOthers}
                  className="mt-4"
                >
                  {signingOutOthers ? "Signing out..." : "Sign Out Other Devices"}
                </Button>
              </div>
            </section>

            <section className="mt-4 border border-[var(--line-strong)] bg-[var(--surface)]">
              <div className="border-b border-[var(--line)] px-5 py-4">
                <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                  Two-Factor Authentication
                </h2>
                <p className="mt-1 text-[12px] text-[var(--ink-3)]">
                  A second check at sign-in: a six-digit code from your authenticator app.
                </p>
              </div>

              <div className="p-5">
                {twoFactorMessage && (
                  <div
                    role="alert"
                    className={
                      twoFactorMessage.type === "success"
                        ? "mb-4 border border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-3 text-[13px] text-[var(--ink-2)]"
                        : "mb-4 border border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] px-4 py-3 text-[13px] text-[var(--status-invalid-text)]"
                    }
                  >
                    {twoFactorMessage.text}
                  </div>
                )}

                {twoFactorLoading ? (
                  <div className="h-14 animate-skeleton border border-[var(--line)]" />
                ) : twoFactor?.enabled ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-[var(--ink)]">Authenticator app</p>
                        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
                          {twoFactor.recoveryCodesRemaining} recovery code
                          {twoFactor.recoveryCodesRemaining === 1 ? "" : "s"} remaining
                        </p>
                      </div>
                      <span className="stamp stamp-pass">Enabled</span>
                    </div>

                    {twoFactorStep === "disable" ? (
                      <div className="space-y-3 border border-[var(--line)] p-4">
                        <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">
                          Enter a code from your authenticator app — or one of your recovery codes —
                          to turn two-factor authentication off.
                        </p>
                        <Input
                          value={twoFactorCode}
                          onChange={(e) => setTwoFactorCode(e.target.value)}
                          placeholder="123456 or XXXXX-XXXXX"
                          className="font-mono"
                          maxLength={12}
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={confirmTwoFactorDisable}
                            variant="danger"
                            size="sm"
                            disabled={twoFactorBusy || !twoFactorCode.trim()}
                          >
                            {twoFactorBusy ? "Disabling..." : "Confirm Disable"}
                          </Button>
                          <Button onClick={resetTwoFactorFlow} variant="ghost" size="sm">
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        onClick={() => {
                          setTwoFactorStep("disable");
                          setTwoFactorCode("");
                          setTwoFactorMessage(null);
                        }}
                        variant="ghost"
                      >
                        Disable Two-Factor Authentication
                      </Button>
                    )}
                  </div>
                ) : twoFactorStep === "setup" ? (
                  <div className="space-y-4">
                    <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">
                      1. Add this secret to your authenticator app (Google Authenticator, Authy,
                      1Password...):
                    </p>
                    <code className="block select-all break-all border border-[var(--line-strong)] bg-[var(--surface-2)] p-4 font-mono text-sm text-[var(--ink)]">
                      {twoFactorSetup?.secret}
                    </code>
                    {twoFactorSetup?.otpauthUri && (
                      <a
                        href={twoFactorSetup.otpauthUri}
                        className="block break-all font-mono text-[10px] text-[var(--accent-text)] hover:underline"
                      >
                        {twoFactorSetup.otpauthUri}
                      </a>
                    )}
                    <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">
                      2. Enter the 6-digit code shown by your app to confirm:
                    </p>
                    <Input
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value)}
                      placeholder="123456"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className="font-mono"
                      maxLength={6}
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={confirmTwoFactorEnable}
                        variant="primary"
                        disabled={twoFactorBusy || twoFactorCode.trim().length < 6}
                      >
                        {twoFactorBusy ? "Verifying..." : "Verify & Enable"}
                      </Button>
                      <Button onClick={resetTwoFactorFlow} variant="ghost">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : twoFactorStep === "recovery" && twoFactorRecoveryCodes ? (
                  <div className="space-y-4">
                    <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">
                      Store these recovery codes somewhere safe. Each code can be used once to sign
                      in if you lose access to your authenticator app. They are shown only this
                      time.
                    </p>
                    <div className="grid grid-cols-2 gap-2 border border-[var(--line-strong)] bg-[var(--surface-2)] p-4 font-mono text-sm text-[var(--ink)]">
                      {twoFactorRecoveryCodes.map((recoveryCode) => (
                        <span key={recoveryCode}>{recoveryCode}</span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={copyRecoveryCodes} variant="secondary">
                        Copy codes
                      </Button>
                      <Button onClick={resetTwoFactorFlow} variant="ghost">
                        Done
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="max-w-[62ch] text-[12px] leading-relaxed text-[var(--ink-2)]">
                      Add a second step to your sign-in. Even if someone gets access to your email,
                      they cannot sign in without your device.
                    </p>
                    <Button
                      onClick={startTwoFactorSetup}
                      variant="primary"
                      disabled={twoFactorBusy}
                      className="mt-4"
                    >
                      {twoFactorBusy ? "Preparing..." : "Enable Two-Factor Authentication"}
                    </Button>
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {activeTab === "danger" && (
          <section className="border border-[var(--status-invalid)] bg-[var(--surface)]">
            <div className="border-b border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] px-5 py-4">
              <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--status-invalid-text)]">
                Danger Zone
              </h2>
              <p className="mt-1 text-[12px] text-[var(--status-invalid-text)]">
                Irreversible actions. Read twice.
              </p>
            </div>

            <div className="p-5">
              {errorMessage && (
                <div className="mb-4 border border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] px-4 py-3 text-[13px] text-[var(--status-invalid-text)]">
                  {errorMessage}
                </div>
              )}

              <div className="border border-[var(--line)] p-4">
                <p className="font-medium text-[var(--ink)]">Delete Account</p>
                <p className="mt-1 max-w-[62ch] text-[12px] leading-relaxed text-[var(--ink-2)]">
                  Schedule deletion of your account and all associated data. You will have 5 seconds
                  to undo this action.
                </p>
                <Button onClick={deleteAccount} variant="danger" className="mt-4">
                  Delete My Account
                </Button>
              </div>
            </div>
          </section>
        )}
      </div>

      <Modal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete Account"
        size="sm"
      >
        <p className="mb-6 text-sm leading-relaxed text-[var(--ink-2)]">
          This action will schedule your account for deletion. You will have 5 seconds to undo this
          action. All your data, including scans, reports, and account details, will be permanently
          deleted after the undo window expires.
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setDeleteConfirmOpen(false)} variant="ghost">
            Cancel
          </Button>
          <Button onClick={handleDeleteConfirm} variant="danger">
            Delete Forever
          </Button>
        </div>
      </Modal>
    </div>
  );
}
