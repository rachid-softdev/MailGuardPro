"use client";

import { Bell, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Tooltip } from "@/components/ui/Tooltip";
import { useOnlineStatusSync } from "@/hooks/useOnlineStatusSync";
import { useUndoDelete } from "@/hooks/useUndoDelete";
import { useUndoHistory } from "@/hooks/useUndoHistory";
import { logger } from "@/lib/logger";

interface Webhook {
  id: string;
  url: string;
  name: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
}

const EVENT_DESCRIPTIONS: Record<string, string> = {
  bulk_job_completed: "Fires when a bulk validation job finishes processing all emails.",
  credits_low: "Fires when your available credits drop below 20% of your plan limit.",
  subscription_renewed: "Fires after a successful subscription payment renewal.",
  subscription_cancelled: "Fires when a subscription is cancelled (at period end or immediately).",
  daily_report: "Fires daily with a summary of validation activity for the previous day.",
};

const AVAILABLE_EVENTS = [
  { value: "bulk_job_completed", label: "Bulk Job Completed" },
  { value: "credits_low", label: "Credits Low" },
  { value: "subscription_renewed", label: "Subscription Renewed" },
  { value: "subscription_cancelled", label: "Subscription Cancelled" },
  { value: "daily_report", label: "Daily Report" },
];

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testWebhook, setTestWebhook] = useState<Webhook | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Form state
  const [formUrl, setFormUrl] = useState("");
  const [formName, setFormName] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Webhook | null>(null);

  const fetchWebhooks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/webhooks");
      if (res.ok) {
        const data = await res.json();
        setWebhooks(data.data || []);
        setErrorMessage(null);
      } else {
        setErrorMessage(
          "Unable to load webhooks — the server returned an error. Please refresh the page.",
        );
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to fetch webhooks");
      setErrorMessage("Could not connect to the server. Please check your internet connection.");
    } finally {
      setLoading(false);
    }
  };

  const { deleteResource } = useUndoDelete({
    deleteEndpoint: (id: string) => `/api/v1/webhooks/${id}`,
    restoreEndpoint: (id: string) => `/api/v1/webhooks/${id}/restore`,
    onRestored: fetchWebhooks,
    onExpired: fetchWebhooks,
    getMessage: (name) => `Deleted "${name}"`,
  });

  useEffect(() => {
    fetchWebhooks();
  }, []);

  useOnlineStatusSync(fetchWebhooks);

  const createWebhook = async () => {
    if (!formUrl.trim() || !formName.trim() || formEvents.length === 0) {
      setErrorMessage("Please fill in all fields");
      return;
    }

    // Validate URL
    try {
      new URL(formUrl);
    } catch {
      setErrorMessage("Please enter a valid URL");
      return;
    }

    // Check HTTPS in production
    if (process.env.NODE_ENV === "production" && !formUrl.startsWith("https://")) {
      setErrorMessage("Webhooks must use HTTPS in production");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/v1/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: formUrl,
          name: formName,
          events: formEvents,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setErrorMessage(null);
        fetchWebhooks();
        setShowCreateModal(false);
        resetForm();
      } else {
        setErrorMessage(
          data.error || "Could not create the webhook. The URL may already be registered.",
        );
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to create webhook");
      setErrorMessage(
        "Could not create the webhook due to a network issue. Please check your connection.",
      );
    } finally {
      setCreating(false);
    }
  };

  const deleteWebhook = (webhook: Webhook) => {
    setDeleteTarget(webhook);
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    void deleteResource(deleteTarget.id, { name: deleteTarget.name ?? deleteTarget.url });
    setDeleteTarget(null);
  };

  const { pushUndo } = useUndoHistory();

  const toggleWebhook = async (id: string, isActive: boolean) => {
    const previousState = isActive;
    try {
      const res = await fetch(`/api/v1/webhooks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });

      if (res.ok) {
        setErrorMessage(null);
        fetchWebhooks();
        pushUndo({
          label: previousState ? "Disable webhook" : "Enable webhook",
          undo: () => {
            fetch(`/api/v1/webhooks/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isActive: previousState }),
            }).then((r) => {
              if (r.ok) fetchWebhooks();
            });
          },
          redo: () => {
            fetch(`/api/v1/webhooks/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isActive: !previousState }),
            }).then((r) => {
              if (r.ok) fetchWebhooks();
            });
          },
        });
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to toggle webhook");
      setErrorMessage("Failed to update webhook. Please try again.");
    }
  };

  const handleTestWebhook = async (webhook: Webhook) => {
    setTestWebhook(webhook);
    setShowTestModal(true);
    setTestResult(null);
    setTesting(true);

    try {
      const res = await fetch(`/api/v1/webhooks/${webhook.id}/test`, {
        method: "POST",
      });

      const data = await res.json();

      if (data.success) {
        setTestResult("Test request sent successfully! Check your endpoint for the payload.");
      } else {
        setTestResult(`Test failed: ${data.error}`);
      }
    } catch (error) {
      setTestResult(`Test failed: Network error`);
    } finally {
      setTesting(false);
    }
  };

  const resetForm = () => {
    setFormUrl("");
    setFormName("");
    setFormEvents([]);
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">Webhooks</h1>
          <p className="text-[var(--text-secondary)]">
            Receive real-time notifications when events occur
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
          aria-haspopup="dialog"
          aria-expanded={showCreateModal}
          aria-controls="modal-add-webhook"
        >
          Add Webhook
        </button>
      </div>

      {/* Info */}
      <div className="card mb-8">
        <h3 className="font-medium mb-2">Available Events</h3>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Each webhook can subscribe to one or more event types. Hover for details.
        </p>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_EVENTS.map((event) => (
            <span
              key={event.value}
              className="badge badge-default"
              title={EVENT_DESCRIPTIONS[event.value]}
            >
              {event.label}
            </span>
          ))}
        </div>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-[var(--status-invalid)]/10 border border-[var(--status-invalid)]/30 text-sm text-[var(--status-invalid)]">
          {errorMessage}
        </div>
      )}

      {/* Webhooks List */}
      <div className="card">
        <h2 className="text-lg font-display font-semibold mb-4">Your Webhooks</h2>

        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between p-4 border border-[var(--border)] rounded-lg animate-skeleton"
              >
                <div className="flex-1 min-w-0">
                  <div className="h-5 w-32 bg-[var(--bg-subtle)] rounded mb-2" />
                  <div className="h-4 w-64 bg-[var(--bg-subtle)] rounded mb-2" />
                  <div className="flex gap-2">
                    <div className="h-5 w-16 bg-[var(--bg-subtle)] rounded" />
                    <div className="h-5 w-20 bg-[var(--bg-subtle)] rounded" />
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <div className="h-8 w-14 bg-[var(--bg-subtle)] rounded" />
                  <div className="h-8 w-14 bg-[var(--bg-subtle)] rounded" />
                  <div className="h-8 w-14 bg-[var(--bg-subtle)] rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : webhooks.length > 0 ? (
          <div className="space-y-4">
            {webhooks.map((webhook) => (
              <div
                key={webhook.id}
                className="flex items-center justify-between p-4 border border-[var(--border)] rounded-lg hover:bg-[var(--bg-elevated)] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-medium">{webhook.name}</h3>
                    <span
                      className={`badge ${webhook.isActive ? "badge-success" : "badge-default"}`}
                    >
                      {webhook.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="text-sm font-mono text-[var(--text-muted)] truncate">
                    {webhook.url}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {webhook.events.map((event) => (
                      <span key={event} className="text-xs bg-[var(--bg-subtle)] px-2 py-1 rounded">
                        {event}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleTestWebhook(webhook)}
                    className="btn btn-ghost btn-sm"
                    aria-haspopup="dialog"
                    aria-expanded={showTestModal && testWebhook?.id === webhook.id}
                    aria-controls="modal-test-webhook"
                  >
                    Test
                  </button>
                  <button
                    onClick={() => toggleWebhook(webhook.id, webhook.isActive)}
                    className="btn btn-ghost btn-sm"
                  >
                    {webhook.isActive ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => deleteWebhook(webhook)}
                    className="btn btn-ghost btn-sm text-[var(--status-invalid)]"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-[var(--text-muted)]">
            <div className="w-12 h-12 bg-[var(--bg-subtle)] rounded-full flex items-center justify-center mx-auto mb-4">
              <Bell className="w-6 h-6" />
            </div>
            <p>No webhooks configured</p>
            <p className="text-sm mt-1">Add a webhook to receive notifications</p>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          resetForm();
        }}
        title="Add Webhook"
        id="modal-add-webhook"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Name</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g., My Notification Endpoint"
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">URL</label>
            <input
              type="url"
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="https://your-server.com/webhook"
              className="input w-full"
            />
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <label className="block text-sm font-medium">Events</label>
              <Tooltip
                content="Choose which actions trigger this webhook. Select all that apply."
                side="right"
              >
                <Info className="w-3.5 h-3.5 text-[var(--text-muted)] cursor-help" />
              </Tooltip>
            </div>
            <div className="space-y-2">
              {AVAILABLE_EVENTS.map((event) => (
                <label key={event.value} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formEvents.includes(event.value)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormEvents([...formEvents, event.value]);
                      } else {
                        setFormEvents(formEvents.filter((ev) => ev !== event.value));
                      }
                    }}
                    className="rounded"
                  />
                  <Tooltip content={EVENT_DESCRIPTIONS[event.value]} side="right">
                    <span className="text-sm cursor-help underline decoration-dotted decoration-[var(--text-muted)]/40">
                      {event.label}
                    </span>
                  </Tooltip>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            className="btn btn-ghost flex-1"
            onClick={() => {
              setShowCreateModal(false);
              resetForm();
            }}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary flex-1"
            onClick={createWebhook}
            disabled={creating || !formUrl || !formName || formEvents.length === 0}
          >
            {creating ? "Creating..." : "Create Webhook"}
          </button>
        </div>
      </Modal>

      {/* Test Modal */}
      <Modal
        isOpen={showTestModal && !!testWebhook}
        onClose={() => {
          setShowTestModal(false);
          setTestWebhook(null);
          setTestResult(null);
        }}
        title="Test Webhook"
        id="modal-test-webhook"
      >
        {testWebhook && (
          <>
            <div className="mb-4">
              <p className="text-sm text-[var(--text-muted)]">Sending test to:</p>
              <code className="block font-mono text-sm mt-1">{testWebhook.url}</code>
            </div>

            {testing ? (
              <div className="text-center py-4">
                <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm mt-2">Sending test request...</p>
              </div>
            ) : testResult ? (
              <div
                className={`p-4 rounded-lg ${testResult.includes("success") ? "bg-[var(--status-valid-bg)] border border-[var(--status-valid)]/30" : "bg-[var(--status-invalid-bg)] border border-[var(--status-invalid)]/30"}`}
              >
                <p
                  className={`text-sm ${testResult.includes("success") ? "text-[var(--status-valid)]" : "text-[var(--status-invalid)]"}`}
                >
                  {testResult}
                </p>
              </div>
            ) : null}

            <button
              className="btn btn-primary w-full mt-4"
              onClick={() => {
                setShowTestModal(false);
                setTestWebhook(null);
                setTestResult(null);
              }}
            >
              Close
            </button>
          </>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Webhook"
        id="modal-delete-webhook"
      >
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
        </p>
        <div className="flex gap-3">
          <button className="btn btn-ghost flex-1" onClick={() => setDeleteTarget(null)}>
            Cancel
          </button>
          <button
            className="btn btn-ghost flex-1 text-[var(--status-invalid)]"
            onClick={handleDeleteConfirm}
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
