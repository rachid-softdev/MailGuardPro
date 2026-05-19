"use client";

import { useEffect, useState } from "react";

interface ApiKey {
  id: string;
  keyPrefix: string;
  name: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/api-keys");
      if (res.ok) {
        const data = await res.json();
        setKeys(data.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch keys:", error);
    } finally {
      setLoading(false);
    }
  };

  const createKey = async () => {
    if (!newKeyName.trim()) return;

    setCreating(true);
    try {
      const res = await fetch("/api/v1/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });

      const data = await res.json();

      if (data.success) {
        setNewKey(data.data.key);
        fetchKeys();
      } else {
        alert(data.error || "Failed to create key");
      }
    } catch (error) {
      console.error("Failed to create key:", error);
      alert("Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  const deleteKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to delete this API key? This action cannot be undone.")) {
      return;
    }

    try {
      const res = await fetch(`/api/v1/api-keys/${keyId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchKeys();
      } else {
        alert("Failed to delete key");
      }
    } catch (error) {
      console.error("Failed to delete key:", error);
      alert("Failed to delete key");
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">API Keys</h1>
          <p className="text-[var(--text-secondary)]">
            Manage your API keys for programmatic access
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          Create New Key
        </button>
      </div>

      {/* Warning */}
      <div className="card mb-8 bg-[var(--accent-light)] border-[var(--accent)]">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-[var(--accent)] mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            <p className="font-medium">Keep your API keys secure</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Never share your API keys in public repositories or client-side code. Rotate keys
              immediately if you suspect they have been compromised.
            </p>
          </div>
        </div>
      </div>

      {/* Keys List */}
      <div className="card">
        <h2 className="text-lg font-display font-semibold mb-4">Your API Keys</h2>

        {loading ? (
          <div className="text-center py-8">
            <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : keys.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                    Name
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                    Key
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                    Last Used
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                    Created
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-[var(--text-muted)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-3 px-4 font-medium">{key.name}</td>
                    <td className="py-3 px-4 font-mono text-sm">{key.keyPrefix}...</td>
                    <td className="py-3 px-4">
                      <span className={`badge ${key.isActive ? "badge-success" : "badge-default"}`}>
                        {key.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-[var(--text-muted)]">
                      {formatDate(key.lastUsedAt)}
                    </td>
                    <td className="py-3 px-4 text-sm text-[var(--text-muted)]">
                      {formatDate(key.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => deleteKey(key.id)}
                        className="btn btn-ghost btn-sm text-[var(--status-invalid)]"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-[var(--text-muted)]">
            <div className="w-12 h-12 bg-[var(--bg-subtle)] rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            </div>
            <p>No API keys yet</p>
            <p className="text-sm mt-1">Create your first API key to get started</p>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <h3 className="text-xl font-display font-semibold mb-4">Create API Key</h3>

            {newKey ? (
              <div>
                <div className="bg-[var(--accent-light)] border border-[var(--accent)] rounded-lg p-4 mb-4">
                  <p className="font-medium mb-2">Your new API key:</p>
                  <code className="block font-mono text-sm break-all">{newKey}</code>
                </div>
                <p className="text-sm text-[var(--text-muted)] mb-4">
                  Make sure to copy this key now. You won&apos;t be able to see it again!
                </p>
                <button
                  className="btn btn-primary w-full"
                  onClick={() => {
                    navigator.clipboard.writeText(newKey);
                    setNewKey(null);
                    setShowCreateModal(false);
                    setNewKeyName("");
                  }}
                >
                  Copy & Close
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Key Name</label>
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g., Production API"
                    className="input w-full"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    className="btn btn-ghost flex-1"
                    onClick={() => {
                      setShowCreateModal(false);
                      setNewKeyName("");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary flex-1"
                    onClick={createKey}
                    disabled={creating || !newKeyName.trim()}
                  >
                    {creating ? "Creating..." : "Create Key"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
