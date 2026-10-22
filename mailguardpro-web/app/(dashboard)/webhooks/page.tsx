"use client";

import { Bell, Check, Copy, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button, Card } from "@/components/ui";
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

  // Secret lifecycle: the signing secret is returned exactly once (creation or
  // regeneration) and must be surfaced immediately, then never again.
  const [revealSecret, setRevealSecret] = useState<{ name: string; secret: string } | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [regenerateTarget, setRegenerateTarget] = useState<Webhook | null>(null);
  const [regenerating, setRegenerating] = useState(false);

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
        const createdName = data.data?.name || formName;
        const createdSecret = data.data?.rawSecret as string | undefined;
        setErrorMessage(null);
        fetchWebhooks();
        setShowCreateModal(false);
        resetForm();
        // Surface the one-time signing secret right after creation.
        if (createdSecret) {
          setRevealSecret({ name: createdName, secret: createdSecret });
        }
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
    } catch {
      setTestResult(`Test failed: Network error`);
    } finally {
      setTesting(false);
    }
  };

  const handleCopySecret = () => {
    if (!revealSecret) return;
    navigator.clipboard.writeText(revealSecret.secret);
    setSecretCopied(true);
    setTimeout(() => setSecretCopied(false), 2000);
  };

  const handleRegenerateSecret = async () => {
    if (!regenerateTarget) return;
    const target = regenerateTarget;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/v1/webhooks/${target.id}/regenerate-secret`, {
        method: "POST",
      });
      const data = await res.json();

      if (data.success) {
        setErrorMessage(null);
        setRegenerateTarget(null);
        setRevealSecret({
          name: target.name ?? target.url,
          secret: data.data.rawSecret,
        });
      } else {
        setErrorMessage(data.error || "Could not regenerate the webhook secret. Please try again.");
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to regenerate webhook secret");
      setErrorMessage("Could not regenerate the webhook secret due to a network issue.");
    } finally {
      setRegenerating(false);
    }
  };

  const resetForm = () => {
    setFormUrl("");
    setFormName("");
    setFormEvents([]);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          eyebrow="Developer / notifications"
          title="Webhooks."
          description="Send a signed POST when an event lands. Subscribe one endpoint to as many events as it needs."
          actions={
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowCreateModal(true)}
              aria-haspopup="dialog"
              aria-expanded={showCreateModal}
              aria-controls="modal-add-webhook"
            >
              Add Webhook
            </Button>
          }
          meta={
            <>
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                {webhooks.length} endpoint{webhooks.length === 1 ? "" : "s"}
              </span>
              <span className="h-3 w-px bg-[var(--line)]" aria-hidden="true" />
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
                HMAC-SHA256 / retries x5
              </span>
            </>
          }
        />

        <section className="mb-5 border border-[var(--line-strong)] bg-[var(--surface)]">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <p className="label-mono">Event catalog</p>
            <h2 className="mt-1 font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
              Available Events
            </h2>
            <p className="mt-1 text-[12px] text-[var(--ink-3)]">
              Each webhook can subscribe to one or more event types. Hover for details.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 p-4">
            {AVAILABLE_EVENTS.map((event) => (
              <span
                key={event.value}
                className="stamp stamp-idle"
                title={EVENT_DESCRIPTIONS[event.value]}
              >
                {event.label}
              </span>
            ))}
          </div>
        </section>

        {errorMessage && (
          <div
            role="alert"
            className="mb-4 border border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] px-4 py-3 text-[13px] text-[var(--status-invalid-text)]"
          >
            {errorMessage}
          </div>
        )}

        <Card variant="default" padding="md">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] pb-3">
            <div>
              <p className="label-mono">Endpoints</p>
              <h2 className="mt-1 font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                Your Webhooks
              </h2>
            </div>
            <p className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-3)]">
              {loading ? "Reading…" : `${webhooks.length} registered`}
            </p>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border border-[var(--line)] p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 h-3 w-32 animate-skeleton bg-[var(--surface-3)]" />
                    <div className="mb-2 h-3 w-64 animate-skeleton bg-[var(--surface-3)]" />
                    <div className="flex gap-2">
                      <div className="h-4 w-16 animate-skeleton bg-[var(--surface-3)]" />
                      <div className="h-4 w-20 animate-skeleton bg-[var(--surface-3)]" />
                    </div>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <div className="h-7 w-14 animate-skeleton bg-[var(--surface-3)]" />
                    <div className="h-7 w-14 animate-skeleton bg-[var(--surface-3)]" />
                    <div className="h-7 w-14 animate-skeleton bg-[var(--surface-3)]" />
                  </div>
                </div>
              ))}
            </div>
          ) : webhooks.length > 0 ? (
            <div className="space-y-4">
              {webhooks.map((webhook) => (
                <div
                  key={webhook.id}
                  className="flex flex-col gap-3 border border-[var(--line)] p-4 transition-colors hover:bg-[var(--surface-2)] sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-[var(--ink)]">{webhook.name}</h3>
                      <span className={webhook.isActive ? "stamp stamp-pass" : "stamp stamp-idle"}>
                        {webhook.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="truncate font-mono text-[11px] text-[var(--ink-3)]">
                      {webhook.url}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {webhook.events.map((event) => (
                        <span key={event} className="stamp stamp-idle">
                          {event}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:ml-4">
                    <Button
                      onClick={() => handleTestWebhook(webhook)}
                      variant="ghost"
                      size="sm"
                      aria-haspopup="dialog"
                      aria-expanded={showTestModal && testWebhook?.id === webhook.id}
                      aria-controls="modal-test-webhook"
                    >
                      Test
                    </Button>
                    <Button onClick={() => setRegenerateTarget(webhook)} variant="ghost" size="sm">
                      Regenerate
                    </Button>
                    <Button
                      onClick={() => toggleWebhook(webhook.id, webhook.isActive)}
                      variant="ghost"
                      size="sm"
                    >
                      {webhook.isActive ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      onClick={() => deleteWebhook(webhook)}
                      variant="ghost"
                      size="sm"
                      className="text-[var(--status-invalid)]"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center text-[var(--ink-3)]">
              <span className="flex h-10 w-10 items-center justify-center border border-[var(--line)] bg-[var(--surface-2)]">
                <Bell className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="mt-3 text-sm font-medium text-[var(--ink)]">No webhooks configured</p>
              <p className="mt-1 text-[12px]">Add a webhook to receive notifications.</p>
            </div>
          )}
        </Card>
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
            <label htmlFor="webhook-name" className="label-mono mb-1.5 block">
              Name
            </label>
            <input
              id="webhook-name"
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g., My Notification Endpoint"
              className="input w-full"
            />
          </div>

          <div>
            <label htmlFor="webhook-url" className="label-mono mb-1.5 block">
              URL
            </label>
            <input
              id="webhook-url"
              type="url"
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="https://your-server.com/webhook"
              className="input w-full"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <span className="label-mono">Events</span>
              <Tooltip
                content="Choose which actions trigger this webhook. Select all that apply."
                side="right"
              >
                <Info className="h-3.5 w-3.5 cursor-help text-[var(--ink-3)]" aria-hidden="true" />
              </Tooltip>
            </div>
            <div className="space-y-1.5 border border-[var(--line)] bg-[var(--surface-2)] p-3">
              {AVAILABLE_EVENTS.map((event) => (
                <label
                  key={event.value}
                  className="flex cursor-pointer items-center gap-2 py-0.5 text-[13px]"
                >
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
                    className="h-3.5 w-3.5 accent-[var(--accent)]"
                  />
                  <Tooltip content={EVENT_DESCRIPTIONS[event.value]} side="right">
                    <span className="cursor-help text-[var(--ink-2)] underline decoration-dotted decoration-[var(--ink-3)]/40">
                      {event.label}
                    </span>
                  </Tooltip>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() => {
              setShowCreateModal(false);
              resetForm();
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={createWebhook}
            disabled={creating || !formUrl || !formName || formEvents.length === 0}
          >
            {creating ? "Creating…" : "Create Webhook"}
          </Button>
        </div>
      </Modal>

      {/* Secret Reveal Modal (shown once after creation or regeneration) */}
      <Modal
        isOpen={!!revealSecret}
        onClose={() => setRevealSecret(null)}
        title="Webhook Signing Secret"
        id="modal-webhook-secret"
      >
        {revealSecret && (
          <div>
            <div className="border border-[var(--status-valid)] bg-[var(--status-valid-bg)] p-4">
              <div className="flex items-center gap-2 border-b border-[var(--status-valid)]/40 pb-3">
                <Check className="h-4 w-4 text-[var(--status-valid-text)]" aria-hidden="true" />
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--status-valid-text)]">
                  Secret ready / copy now
                </p>
              </div>
              <p className="label-mono mt-3 text-[var(--ink-3)]">
                Signing secret · {revealSecret.name}
              </p>
              <div className="mt-2 flex items-center gap-2 border border-[var(--line-strong)] bg-[var(--surface)] p-3 font-mono text-[11px]">
                <span className="flex-1 break-all text-[var(--ink)]">{revealSecret.secret}</span>
                <button
                  type="button"
                  onClick={handleCopySecret}
                  className="shrink-0 text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
                  aria-label={secretCopied ? "Copied" : "Copy secret"}
                >
                  {secretCopied ? (
                    <Check className="h-4 w-4 text-[var(--status-valid)] animate-pulse-dot" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-[var(--ink-2)]">
              This secret is shown once. Copy it before closing; deliveries are signed with
              HMAC-SHA256 using this value.
            </p>
            <Button
              variant="primary"
              className="mt-4 w-full"
              onClick={() => {
                navigator.clipboard.writeText(revealSecret.secret);
                setRevealSecret(null);
              }}
            >
              Copy & Close
            </Button>
          </div>
        )}
      </Modal>

      {/* Regenerate Secret Confirmation Modal */}
      <Modal
        isOpen={!!regenerateTarget}
        onClose={() => setRegenerateTarget(null)}
        title="Regenerate Signing Secret"
        id="modal-regenerate-secret"
      >
        {regenerateTarget && (
          <>
            <p className="text-[13px] leading-relaxed text-[var(--ink-2)]">
              Replace the signing secret for{" "}
              <span className="font-mono text-[12px] text-[var(--ink)]">
                {regenerateTarget.name}
              </span>
              ? Deliveries are signed with the new secret immediately — signature verification with
              the old secret will fail until your endpoint is updated.
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setRegenerateTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={handleRegenerateSecret}
                disabled={regenerating}
              >
                {regenerating ? "Regenerating…" : "Regenerate Secret"}
              </Button>
            </div>
          </>
        )}
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
              <p className="label-mono mb-1">Target</p>
              <code className="block break-all border border-[var(--line)] bg-[var(--surface-2)] p-2 font-mono text-[11px] text-[var(--ink-2)]">
                {testWebhook.url}
              </code>
            </div>

            {testing ? (
              <div className="flex items-center gap-3 border border-[var(--line)] px-4 py-3">
                <div className="h-4 w-4 animate-spin border-2 border-[var(--accent)] border-t-transparent" />
                <p className="text-[13px] text-[var(--ink-2)]">Sending test request…</p>
              </div>
            ) : testResult ? (
              <div
                className={`border px-4 py-3 text-[13px] ${
                  testResult.includes("success")
                    ? "border-[var(--status-valid)] bg-[var(--status-valid-bg)] text-[var(--status-valid-text)]"
                    : "border-[var(--status-invalid)] bg-[var(--status-invalid-bg)] text-[var(--status-invalid-text)]"
                }`}
              >
                {testResult}
              </div>
            ) : null}

            <Button
              variant="primary"
              className="mt-4 w-full"
              onClick={() => {
                setShowTestModal(false);
                setTestWebhook(null);
                setTestResult(null);
              }}
            >
              Close
            </Button>
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
        <p className="text-[13px] leading-relaxed text-[var(--ink-2)]">
          Delete{" "}
          <span className="font-mono text-[12px] text-[var(--ink)]">{deleteTarget?.name}</span> and
          stop all deliveries to this endpoint? You have 5 seconds to undo this action.
        </p>
        <div className="mt-6 flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="ghost"
            className="flex-1 text-[var(--status-invalid)]"
            onClick={handleDeleteConfirm}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
