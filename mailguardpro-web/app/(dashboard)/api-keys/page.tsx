"use client";

import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button, Card } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { Tooltip } from "@/components/ui/Tooltip";
import { useOnlineStatusSync } from "@/hooks/useOnlineStatusSync";
import { useUndoDelete } from "@/hooks/useUndoDelete";
import { logger } from "@/lib/logger";
import { formatScopes, SCOPE_OPTIONS } from "./scopeOptions";

interface ApiKey {
  id: string;
  keyPrefix: string;
  name: string;
  scopes: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScope, setNewKeyScope] = useState("full");
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
        body: JSON.stringify({ name: newKeyName, scope: newKeyScope }),
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
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          eyebrow="Developer / credentials"
          title="API keys."
          description="Programmatic access to the validation API. Keys are shown once at creation — store them in a secret manager, not in client code."
          actions={
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowCreateModal(true)}
              aria-haspopup="dialog"
              aria-expanded={showCreateModal}
              aria-controls="modal-create-api-key"
            >
              Create New Key
            </Button>
          }
          meta={
            <>
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                {loading
                  ? "Reading register…"
                  : `${keys.length} key${keys.length === 1 ? "" : "s"}`}
              </span>
              <span className="h-3 w-px bg-[var(--line)]" aria-hidden="true" />
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                Bearer auth / scoped access
              </span>
            </>
          }
        />

        {/* Security notice */}
        <section
          aria-label="API key security"
          className="mb-5 flex items-start gap-3 border border-[var(--line)] border-l-2 border-l-[var(--accent)] bg-[var(--surface-2)] px-4 py-3"
        >
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink)]">
              Keep your API keys secure
            </p>
            <p className="mt-1 max-w-[80ch] text-[12px] leading-relaxed text-[var(--ink-2)]">
              Never share keys in public repositories or client-side code. Rotate a key immediately
              if you suspect it has been exposed.
            </p>
          </div>
        </section>

        {/* Keys register */}
        <Card variant="default" padding="md">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] pb-3">
            <div>
              <p className="label-mono">Credentials</p>
              <h2 className="mt-1 font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                Your API Keys
              </h2>
            </div>
            <p className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
              {loading ? "Reading…" : `${keys.filter((key) => key.isActive).length} active`}
            </p>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mb-4 border border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] px-4 py-3 text-[13px] text-[var(--status-invalid-text)]"
            >
              {errorMessage}
            </div>
          )}

          {loading ? (
            <div className="space-y-px border border-[var(--line)] bg-[var(--line)]">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="grid grid-cols-2 items-center gap-4 bg-[var(--surface)] px-4 py-4 sm:grid-cols-6"
                >
                  <div className="h-3 w-28 animate-skeleton bg-[var(--surface-3)]" />
                  <div className="h-3 w-24 animate-skeleton bg-[var(--surface-3)]" />
                  <div className="h-3 w-14 animate-skeleton bg-[var(--surface-3)]" />
                  <div className="h-3 w-16 animate-skeleton bg-[var(--surface-3)]" />
                  <div className="h-3 w-16 animate-skeleton bg-[var(--surface-3)]" />
                  <div className="ml-auto h-3 w-12 animate-skeleton bg-[var(--surface-3)]" />
                </div>
              ))}
            </div>
          ) : keys.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Key</th>
                    <th>Status</th>
                    <th>Access</th>
                    <th>Last Used</th>
                    <th>Created</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => (
                    <tr key={key.id}>
                      <td className="font-medium text-[var(--ink)]">{key.name}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-[var(--ink-2)]">
                            {key.keyPrefix}…
                          </span>
                          <Tooltip content="Copy key prefix" side="top">
                            <button
                              type="button"
                              onClick={() => handleCopyPrefix(key.id, key.keyPrefix)}
                              className="text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
                              aria-label="Copy key prefix"
                            >
                              {copiedPrefixKey === key.id ? (
                                <Check className="h-3.5 w-3.5 text-[var(--status-valid)]" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </Tooltip>
                        </div>
                      </td>
                      <td>
                        <span className={key.isActive ? "stamp stamp-pass" : "stamp stamp-idle"}>
                          {key.isActive ? "Active" : "Revoked"}
                        </span>
                      </td>
                      <td className="font-mono text-[10px] uppercase tracking-[0.04em] text-[var(--ink-3)]">
                        {formatScopes(key.scopes)}
                      </td>
                      <td className="whitespace-nowrap text-[var(--ink-2)]">
                        {formatDate(key.lastUsedAt)}
                      </td>
                      <td className="whitespace-nowrap text-[var(--ink-2)]">
                        {formatDate(key.createdAt)}
                      </td>
                      <td className="text-right">
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
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <span className="flex h-10 w-10 items-center justify-center border border-[var(--line)] bg-[var(--surface-2)]">
                <KeyRound className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
              </span>
              <p className="mt-3 text-sm font-medium text-[var(--ink)]">No API keys yet</p>
              <p className="mt-1 text-[12px] text-[var(--ink-3)]">
                Create your first key to call the API programmatically.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-4"
                onClick={() => setShowCreateModal(true)}
              >
                Create New Key
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setNewKeyName("");
          setNewKeyScope("full");
        }}
        title="Create API Key"
        id="modal-create-api-key"
      >
        {newKey ? (
          <div>
            <div className="border border-[var(--status-valid)] bg-[var(--status-valid-bg)] p-4">
              <div className="flex items-center gap-2 border-b border-[var(--status-valid)]/40 pb-3">
                <Check className="h-4 w-4 text-[var(--status-valid-text)]" aria-hidden="true" />
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--status-valid-text)]">
                  Key created / copy now
                </p>
              </div>
              <p className="label-mono mt-3 text-[var(--ink-3)]">Raw key</p>
              <div className="mt-2 flex items-center gap-2 border border-[var(--line-strong)] bg-[var(--surface)] p-3 font-mono text-[11px]">
                <span className="flex-1 break-all text-[var(--ink)]">{newKey}</span>
                <button
                  type="button"
                  onClick={handleCopyNewKey}
                  className="shrink-0 text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
                  aria-label={newKeyCopied ? "Copied" : "Copy API key"}
                >
                  {newKeyCopied ? (
                    <Check className="h-4 w-4 text-[var(--status-valid)] animate-pulse-dot" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-[var(--ink-2)]">
              This is the only time the key will be shown. Copy it into your secret manager before
              closing this panel.
            </p>
            <Button
              variant="primary"
              className="mt-4 w-full"
              onClick={() => {
                navigator.clipboard.writeText(newKey);
                setNewKey(null);
                setShowCreateModal(false);
                setNewKeyName("");
                setNewKeyScope("full");
              }}
            >
              Copy & Close
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div>
                <label htmlFor="api-key-name" className="label-mono mb-1.5 block">
                  Key name
                </label>
                <input
                  id="api-key-name"
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g., Production API"
                  className="input w-full"
                />
              </div>
              <div>
                <label htmlFor="api-key-scope" className="label-mono mb-1.5 block">
                  Access level
                </label>
                <select
                  id="api-key-scope"
                  value={newKeyScope}
                  onChange={(e) => setNewKeyScope(e.target.value)}
                  className="input w-full"
                >
                  {SCOPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-3)]">
                  {SCOPE_OPTIONS.find((option) => option.value === newKeyScope)?.description}
                </p>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  setShowCreateModal(false);
                  setNewKeyName("");
                  setNewKeyScope("full");
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
                {creating ? "Creating…" : "Create Key"}
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
        <p className="text-[13px] leading-relaxed text-[var(--ink-2)]">
          Delete{" "}
          <span className="font-mono text-[12px] text-[var(--ink)]">{deleteTarget?.name}</span>? The
          key stops authenticating immediately. You have 5 seconds to undo this action.
        </p>
        <div className="mt-6 flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={handleDeleteConfirm}>
            <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Delete Key
          </Button>
        </div>
      </Modal>
    </div>
  );
}
