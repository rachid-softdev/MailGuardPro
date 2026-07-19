"use client";

import { Check, Copy, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button, Card } from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Tooltip } from "@/components/ui/Tooltip";
import { useOnlineStatusSync } from "@/hooks/useOnlineStatusSync";
import { useUndoDelete } from "@/hooks/useUndoDelete";
import { logger } from "@/lib/logger";

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);
  const [copiedPrefixKey, setCopiedPrefixKey] = useState<string | null>(null);
  const [newKeyCopied, setNewKeyCopied] = useState(false);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/api-keys");
      if (res.ok) {
        const data = await res.json();
        setKeys(data.data || []);
        setErrorMessage(null);
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to fetch keys");
      setErrorMessage(
        "Unable to load API keys — the server returned an error. Please refresh the page.",
      );
    } finally {
      setLoading(false);
    }
  };

  const { deleteResource } = useUndoDelete({
    deleteEndpoint: (id: string) => `/api/v1/api-keys/${id}`,
    restoreEndpoint: (id: string) => `/api/v1/api-keys/${id}/restore`,
    onRestored: fetchKeys,
    onExpired: fetchKeys,
    getMessage: (name) => `Deleted "${name}"`,
  });

  useEffect(() => {
    fetchKeys();
  }, []);

  useOnlineStatusSync(fetchKeys);

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
        setErrorMessage(null);
        fetchKeys();
      } else {
        setErrorMessage(
          data.error || "Could not create the key. The name may already exist or be invalid.",
        );
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to create key");
      setErrorMessage(
        "Could not create the key due to a network issue. Please check your connection and try again.",
      );
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString();
  };

  const handleCopyPrefix = (keyId: string, prefix: string) => {
    navigator.clipboard.writeText(prefix);
    setCopiedPrefixKey(keyId);
    setTimeout(() => setCopiedPrefixKey(null), 2000);
  };

  const handleCopyNewKey = () => {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey);
    setNewKeyCopied(true);
    setTimeout(() => setNewKeyCopied(false), 2000);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await deleteResource(deleteTarget.id, { name: deleteTarget.name });
    setDeleteTarget(null);
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">API Keys</h1>
          <p className="text-[var(--text-secondary)]">
            Manage your API keys for programmatic access
          </p>
        </div>
        <Button
          variant="primary"
          className="self-start sm:self-auto"
          onClick={() => setShowCreateModal(true)}
          aria-haspopup="dialog"
          aria-expanded={showCreateModal}
          aria-controls="modal-create-api-key"
        >
          Create New Key
        </Button>
      </div>

      {/* Warning */}
      <Card
        variant="default"
        padding="md"
        className="mb-8 bg-[var(--accent-light)] border-[var(--accent)]"
      >
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
      </Card>

      {/* Keys List */}
      <Card variant="default" padding="md">
        <h2 className="text-lg font-display font-semibold mb-4">Your API Keys</h2>

        {errorMessage && (
          <div className="animate-fade-slide-in mb-4 bg-[var(--status-invalid-bg)] border border-[var(--status-invalid)] rounded-lg p-3 flex items-start gap-3">
            <svg
              className="w-5 h-5 text-[var(--status-invalid)] mt-0.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm text-[var(--status-invalid)]">{errorMessage}</p>
          </div>
        )}

        {loading ? (
          <div className="space-y-0 divide-y divide-[var(--border)]">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-6 py-4 px-4">
                <div className="h-4 w-28 bg-[var(--bg-subtle)] animate-skeleton rounded" />
                <div className="h-4 w-20 bg-[var(--bg-subtle)] animate-skeleton rounded" />
                <div className="h-5 w-14 bg-[var(--bg-subtle)] animate-skeleton rounded-full" />
                <div className="h-4 w-16 bg-[var(--bg-subtle)] animate-skeleton rounded" />
                <div className="h-4 w-16 bg-[var(--bg-subtle)] animate-skeleton rounded" />
                <div className="h-4 w-14 bg-[var(--bg-subtle)] animate-skeleton rounded ml-auto" />
              </div>
            ))}
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
                  <tr
                    key={key.id}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)] transition-colors"
                  >
                    <td className="py-3 px-4 font-medium">{key.name}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{key.keyPrefix}...</span>
                        <Tooltip content="Copy key prefix" side="top">
                          <button
                            onClick={() => handleCopyPrefix(key.id, key.keyPrefix)}
                            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                            aria-label="Copy key prefix"
                          >
                            {copiedPrefixKey === key.id ? (
                              <Check className="w-4 h-4 text-[var(--status-valid)]" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={key.isActive ? "valid" : "unknown"} showDot={true} />
                    </td>
                    <td className="py-3 px-4 text-sm text-[var(--text-muted)]">
                      {formatDate(key.lastUsedAt)}
                    </td>
                    <td className="py-3 px-4 text-sm text-[var(--text-muted)]">
                      {formatDate(key.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[var(--status-invalid)]"
                        onClick={() => setDeleteTarget(key)}
                      >
                        Delete
                      </Button>
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
      </Card>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setNewKeyName("");
        }}
        title="Create API Key"
        id="modal-create-api-key"
      >
        {newKey ? (
          <div>
            <div className="bg-[var(--status-valid-bg)] border border-[var(--status-valid)] rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Check className="w-5 h-5 text-[var(--status-valid)]" />
                <p className="font-medium text-[var(--status-valid)]">
                  API Key Created Successfully
                </p>
              </div>
              <p className="text-sm text-[var(--text-muted)] mb-2">Your new API key:</p>
              <div className="flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-3 font-mono text-sm">
                <span className="flex-1 break-all">{newKey}</span>
                <button
                  onClick={handleCopyNewKey}
                  className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  aria-label={newKeyCopied ? "Copied" : "Copy API key"}
                >
                  {newKeyCopied ? (
                    <Check className="w-4 h-4 text-[var(--status-valid)] animate-pulse-dot" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Make sure to copy this key now. You won&apos;t be able to see it again!
            </p>
            <Button
              variant="primary"
              className="w-full"
              onClick={() => {
                navigator.clipboard.writeText(newKey);
                setNewKey(null);
                setShowCreateModal(false);
                setNewKeyName("");
              }}
            >
              Copy & Close
            </Button>
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
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  setShowCreateModal(false);
                  setNewKeyName("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={createKey}
                disabled={creating || !newKeyName.trim()}
              >
                {creating ? "Creating..." : "Create Key"}
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete API Key"
        size="sm"
      >
        <p className="text-sm text-[var(--text-muted)] mb-6">
          Are you sure you want to delete{" "}
          <span className="font-medium text-[var(--text-primary)]">{deleteTarget?.name}</span>? You
          will have 5 seconds to undo this action.
        </p>
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={handleDeleteConfirm}>
            <Trash2 className="w-4 h-4 mr-1.5" />
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
