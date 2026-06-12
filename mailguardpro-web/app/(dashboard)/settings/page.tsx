"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { logger } from "@/lib/logger";

interface User {
  id: string;
  name: string | null;
  email: string | null;
  plan: string;
  credits: number;
  createdAt: string;
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
    } catch (error) {
      setMessage({ type: "error", text: "An error occurred" });
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
    }
  };

  const deleteAccount = () => {
    setErrorMessage(null);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    setDeleteConfirmOpen(false);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/v1/user/account", { method: "DELETE" });
      if (res.ok) {
        router.push("/");
      } else {
        setErrorMessage("Failed to delete account");
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to delete account");
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
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-8 w-20 animate-skeleton rounded" />
          ))}
        </div>
        <div className="card">
          <div className="space-y-4">
            <div className="h-4 w-16 animate-skeleton rounded mb-2" />
            <div className="h-10 w-full animate-skeleton rounded" />
            <div className="h-4 w-16 animate-skeleton rounded mb-2" />
            <div className="h-10 w-full animate-skeleton rounded" />
            <div className="h-10 w-32 animate-skeleton rounded" />
          </div>
        </div>
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
      <div className="flex gap-1 mb-8 border-b border-[var(--border)]">
        {["profile", "billing", "api", "danger"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors duration-150 ${
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
        <div className="card max-w-2xl">
          <h2 className="text-lg font-display font-semibold mb-6">Profile Information</h2>

          {message && (
            <div
              className={`p-4 rounded-lg mb-6 ${message.type === "success" ? "bg-[var(--status-valid-bg)] text-[var(--status-valid)]" : "bg-[var(--status-invalid-bg)] text-[var(--status-invalid)]"}`}
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

            <button onClick={saveProfile} disabled={saving} className="btn btn-primary">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {/* Billing Tab */}
      {activeTab === "billing" && (
        <div className="card max-w-2xl">
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

            <button onClick={openStripePortal} className="btn btn-primary">
              Manage Billing
            </button>

            <p className="text-sm text-[var(--text-muted)]">
              Open the Stripe customer portal to update your payment method, view invoices, or
              change your subscription plan.
            </p>
          </div>
        </div>
      )}

      {/* API Tab */}
      {activeTab === "api" && (
        <div className="card max-w-2xl">
          <h2 className="text-lg font-display font-semibold mb-6">API Access</h2>

          <div className="space-y-4">
            <p className="text-[var(--text-secondary)]">
              Manage your API keys to access MailGuard Pro programmatically.
            </p>

            <a href="/api-keys" className="btn btn-primary inline-block">
              Manage API Keys
            </a>
          </div>
        </div>
      )}

      {/* Danger Tab */}
      {activeTab === "danger" && (
        <div className="card max-w-2xl border-[var(--status-invalid)]">
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
                Permanently delete your account and all associated data. This action cannot be
                undone.
              </p>
              <button onClick={deleteAccount} className="btn btn-danger mt-4">
                Delete My Account
              </button>
            </div>
          </div>

          <Modal
            isOpen={deleteConfirmOpen}
            onClose={() => setDeleteConfirmOpen(false)}
            title="Delete Account"
            size="sm"
          >
            <p className="text-[var(--text-secondary)] mb-6">
              This action is permanent and cannot be undone. All your data, including scans,
              reports, and account details, will be permanently deleted.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirmOpen(false)} className="btn btn-ghost">
                Cancel
              </button>
              <button onClick={handleDeleteConfirm} className="btn btn-danger">
                Delete Forever
              </button>
            </div>
          </Modal>
        </div>
      )}
    </div>
  );
}
