"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Input } from "@/components/ui";
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
      <div className="p-8 max-w-2xl">
        <div className="mb-8">
          <div className="h-8 w-48 animate-skeleton rounded mb-2" />
          <div className="h-4 w-72 animate-skeleton rounded" />
        </div>
        <div className="flex gap-1 mb-8 border-b border-[var(--border)]">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 w-20 animate-skeleton rounded" />
          ))}
        </div>
        <Card variant="default" padding="md">
          <div className="space-y-4">
            <div className="h-4 w-16 animate-skeleton rounded mb-2" />
            <div className="h-10 w-full animate-skeleton rounded" />
            <div className="h-4 w-16 animate-skeleton rounded mb-2" />
            <div className="h-10 w-full animate-skeleton rounded" />
            <div className="h-10 w-32 animate-skeleton rounded" />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold mb-2">Settings</h1>
        <p className="text-[var(--text-secondary)]">Manage your account settings and preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 border-b border-[var(--border)] overflow-x-auto pb-px">
        {["profile", "billing", "api", "security", "danger"].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              if (tab === "security" && sessions === null && !sessionsLoading) {
                void fetchSessions();
              }
              if (tab === "security" && twoFactor === null && !twoFactorLoading) {
                void fetchTwoFactorStatus();
              }
            }}
            className={`px-4 py-2 text-sm font-medium capitalize transition-all duration-200 ${
              activeTab === tab
                ? "text-[var(--accent)] border-b-2 border-[var(--accent)] -mb-px"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === "profile" && (
        <Card variant="default" padding="md" className="animate-fade-slide-up max-w-2xl">
          <h2 className="text-lg font-display font-semibold mb-6">Profile Information</h2>

          {message && (
            <div
              className={`animate-fade-slide-in p-4 rounded-lg mb-6 ${message.type === "success" ? "bg-[var(--status-valid-bg)] text-[var(--status-valid)]" : "bg-[var(--status-invalid-bg)] text-[var(--status-invalid)]"}`}
            >
              {message.text}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input w-full"
                placeholder="Your name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={email}
                disabled
                className="input w-full bg-[var(--bg-subtle)] cursor-not-allowed"
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Contact support to change your email address
              </p>
            </div>

            <Button onClick={saveProfile} disabled={saving} variant="primary">
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </Card>
      )}

      {/* Billing Tab */}
      {activeTab === "billing" && (
        <Card variant="default" padding="md" className="animate-fade-slide-up max-w-2xl">
          <h2 className="text-lg font-display font-semibold mb-6">Billing & Subscription</h2>

          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 border border-[var(--border)] rounded-lg">
              <div>
                <p className="font-medium">Current Plan</p>
                <p className="text-sm text-[var(--text-muted)]">
                  {user?.plan === "FREE" ? "Free Plan" : user?.plan} • {user?.credits} credits
                  remaining
                </p>
              </div>
              <span className="badge badge-accent">{user?.plan || "FREE"}</span>
            </div>

            <Button onClick={openStripePortal} variant="primary">
              Manage Billing
            </Button>

            <p className="text-sm text-[var(--text-muted)]">
              Open the Stripe customer portal to update your payment method, view invoices, or
              change your subscription plan.
            </p>
          </div>
        </Card>
      )}

      {/* API Tab */}
      {activeTab === "api" && (
        <Card variant="default" padding="md" className="animate-fade-slide-up max-w-2xl">
          <h2 className="text-lg font-display font-semibold mb-6">API Access</h2>

          <div className="space-y-4">
            <p className="text-[var(--text-secondary)]">
              Manage your API keys to access MailGuard Pro programmatically.
            </p>

            <Button href="/api-keys" variant="primary" className="inline-block">
              Manage API Keys
            </Button>
          </div>
        </Card>
      )}

      {/* Security Tab */}
      {activeTab === "security" && (
        <>
          <Card variant="default" padding="md" className="animate-fade-slide-up max-w-2xl">
            <h2 className="text-lg font-display font-semibold mb-6">Active Sessions</h2>

            {message && (
              <div
                className={`animate-fade-slide-in p-4 rounded-lg mb-6 ${message.type === "success" ? "bg-[var(--status-valid-bg)] text-[var(--status-valid)]" : "bg-[var(--status-invalid-bg)] text-[var(--status-invalid)]"}`}
              >
                {message.text}
              </div>
            )}

            <p className="text-[var(--text-secondary)] mb-4">
              Devices currently signed in to your account. Revoking a session signs that device out
              immediately. Sessions expire automatically after 30 days.
            </p>

            {sessionsLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-16 border border-[var(--border)] rounded-lg animate-skeleton"
                  />
                ))}
              </div>
            ) : sessions && sessions.length > 0 ? (
              <div className="space-y-3">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-4 border border-[var(--border)] rounded-lg"
                  >
                    <div>
                      <p className="font-medium flex items-center gap-2">
                        Session {s.id.slice(0, 8)}
                        {s.isCurrent && <span className="badge badge-success">This device</span>}
                      </p>
                      <p className="text-sm text-[var(--text-muted)]">
                        Expires {new Date(s.expires).toLocaleDateString()}
                      </p>
                    </div>
                    {!s.isCurrent && (
                      <Button
                        onClick={() => revokeSession(s.id)}
                        variant="ghost"
                        size="sm"
                        className="text-[var(--status-invalid)]"
                        disabled={revokingSessionId === s.id}
                      >
                        {revokingSessionId === s.id ? "Revoking..." : "Revoke"}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">No active sessions found.</p>
            )}

            <div className="mt-6">
              <Button onClick={signOutOtherDevices} variant="ghost" disabled={signingOutOthers}>
                {signingOutOthers ? "Signing out..." : "Sign Out Other Devices"}
              </Button>
            </div>
          </Card>

          <Card variant="default" padding="md" className="animate-fade-slide-up max-w-2xl mt-6">
            <h2 className="text-lg font-display font-semibold mb-6">Two-Factor Authentication</h2>

            {twoFactorMessage && (
              <div
                className={`animate-fade-slide-in p-4 rounded-lg mb-6 ${twoFactorMessage.type === "success" ? "bg-[var(--status-valid-bg)] text-[var(--status-valid)]" : "bg-[var(--status-invalid-bg)] text-[var(--status-invalid)]"}`}
              >
                {twoFactorMessage.text}
              </div>
            )}

            {twoFactorLoading ? (
              <div className="h-16 border border-[var(--border)] rounded-lg animate-skeleton" />
            ) : twoFactor?.enabled ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border border-[var(--border)] rounded-lg">
                  <div>
                    <p className="font-medium">Authenticator app</p>
                    <p className="text-sm text-[var(--text-muted)]">
                      {twoFactor.recoveryCodesRemaining} recovery code
                      {twoFactor.recoveryCodesRemaining === 1 ? "" : "s"} remaining
                    </p>
                  </div>
                  <span className="badge badge-success">Enabled</span>
                </div>

                {twoFactorStep === "disable" ? (
                  <div className="space-y-3 p-4 border border-[var(--border)] rounded-lg">
                    <p className="text-sm text-[var(--text-secondary)]">
                      Enter a code from your authenticator app — or one of your recovery codes — to
                      turn two-factor authentication off.
                    </p>
                    <Input
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value)}
                      placeholder="123456 or XXXXX-XXXXX"
                      className="font-mono"
                      maxLength={12}
                    />
                    <div className="flex gap-3">
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
                <p className="text-sm text-[var(--text-secondary)]">
                  1. Add this secret to your authenticator app (Google Authenticator, Authy,
                  1Password...):
                </p>
                <code className="block p-4 border border-[var(--border)] rounded-lg font-mono text-sm break-all select-all">
                  {twoFactorSetup?.secret}
                </code>
                {twoFactorSetup?.otpauthUri && (
                  <a
                    href={twoFactorSetup.otpauthUri}
                    className="block text-xs font-mono text-[var(--accent)] hover:underline break-all"
                  >
                    {twoFactorSetup.otpauthUri}
                  </a>
                )}
                <p className="text-sm text-[var(--text-secondary)]">
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
                <div className="flex gap-3">
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
                <p className="text-sm text-[var(--text-secondary)]">
                  Store these recovery codes somewhere safe. Each code can be used once to sign in
                  if you lose access to your authenticator app. They are shown only this time.
                </p>
                <div className="grid grid-cols-2 gap-2 p-4 border border-[var(--border)] rounded-lg font-mono text-sm">
                  {twoFactorRecoveryCodes.map((recoveryCode) => (
                    <span key={recoveryCode}>{recoveryCode}</span>
                  ))}
                </div>
                <div className="flex gap-3">
                  <Button onClick={copyRecoveryCodes} variant="secondary">
                    Copy codes
                  </Button>
                  <Button onClick={resetTwoFactorFlow} variant="ghost">
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-[var(--text-secondary)]">
                  Add a second step to your sign-in: a 6-digit code from an authenticator app. Even
                  if someone gets access to your email, they cannot sign in without your device.
                </p>
                <Button onClick={startTwoFactorSetup} variant="primary" disabled={twoFactorBusy}>
                  {twoFactorBusy ? "Preparing..." : "Enable Two-Factor Authentication"}
                </Button>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Danger Tab */}
      {activeTab === "danger" && (
        <Card
          variant="default"
          padding="md"
          className="animate-fade-slide-up max-w-2xl border-[var(--status-invalid)]"
        >
          <h2 className="text-lg font-display font-semibold mb-6 text-[var(--status-invalid)]">
            Danger Zone
          </h2>

          {errorMessage && (
            <div className="p-4 rounded-lg mb-6 bg-[var(--status-invalid-bg)] text-[var(--status-invalid)]">
              {errorMessage}
            </div>
          )}

          <div className="space-y-4">
            <div className="p-4 bg-[var(--status-invalid)]/10 rounded-lg">
              <p className="font-medium">Delete Account</p>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Schedule deletion of your account and all associated data. You will have 5 seconds
                to undo this action.
              </p>
              <Button onClick={deleteAccount} variant="danger" className="mt-4">
                Delete My Account
              </Button>
            </div>
          </div>

          <Modal
            isOpen={deleteConfirmOpen}
            onClose={() => setDeleteConfirmOpen(false)}
            title="Delete Account"
            size="sm"
          >
            <p className="text-[var(--text-secondary)] mb-6">
              This action will schedule your account for deletion. You will have 5 seconds to undo
              this action. All your data, including scans, reports, and account details, will be
              permanently deleted after the undo window expires.
            </p>
            <div className="flex justify-end gap-3">
              <Button onClick={() => setDeleteConfirmOpen(false)} variant="ghost">
                Cancel
              </Button>
              <Button onClick={handleDeleteConfirm} variant="danger">
                Delete Forever
              </Button>
            </div>
          </Modal>
        </Card>
      )}
    </div>
  );
}
