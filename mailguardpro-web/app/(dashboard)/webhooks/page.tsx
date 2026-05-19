"use client";

import { useEffect, useState } from "react";

interface Webhook {
  id: string;
  url: string;
  name: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
}

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

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const fetchWebhooks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/webhooks");
      if (res.ok) {
        const data = await res.json();
        setWebhooks(data.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch webhooks:", error);
    } finally {
      setLoading(false);
    }
  };

  const createWebhook = async () => {
    if (!formUrl.trim() || !formName.trim() || formEvents.length === 0) {
      alert("Please fill in all fields");
      return;
    }

    // Validate URL
    try {
      new URL(formUrl);
    } catch {
      alert("Please enter a valid URL");
      return;
    }

    // Check HTTPS in production
    if (process.env.NODE_ENV === "production" && !formUrl.startsWith("https://")) {
      alert("Webhooks must use HTTPS in production");
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
        fetchWebhooks();
        setShowCreateModal(false);
        resetForm();
      } else {
        alert(data.error || "Failed to create webhook");
      }
    } catch (error) {
      console.error("Failed to create webhook:", error);
      alert("Failed to create webhook");
    } finally {
      setCreating(false);
    }
  };

  const deleteWebhook = async (id: string) => {
    if (!confirm("Are you sure you want to delete this webhook?")) {
      return;
    }

    try {
      const res = await fetch(`/api/v1/webhooks/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchWebhooks();
      } else {
        alert("Failed to delete webhook");
      }
    } catch (error) {
      console.error("Failed to delete webhook:", error);
      alert("Failed to delete webhook");
    }
  };

  const toggleWebhook = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/v1/webhooks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });

      if (res.ok) {
        fetchWebhooks();
      }
    } catch (error) {
      console.error("Failed to toggle webhook:", error);
    }
  };

  const testWebhook = async (webhook: Webhook) => {
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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
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
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          Add Webhook
        </button>
      </div>

      {/* Info */}
      <div className="card mb-8">
        <h3 className="font-medium mb-2">Available Events</h3>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_EVENTS.map((event) => (
            <span key={event.value} className="badge badge-default">
              {event.label}
            </span>
          ))}
        </div>
      </div>

      {/* Webhooks List */}
      <div className="card">
        <h2 className="text-lg font-display font-semibold mb-4">Your Webhooks</h2>

        {loading ? (
          <div className="text-center py-8">
            <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : webhooks.length > 0 ? (
          <div className="space-y-4">
            {webhooks.map((webhook) => (
              <div
                key={webhook.id}
                className="flex items-center justify-between p-4 border border-[var(--border)] rounded-lg"
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
                  <button onClick={() => testWebhook(webhook)} className="btn btn-ghost btn-sm">
                    Test
                  </button>
                  <button
                    onClick={() => toggleWebhook(webhook.id, webhook.isActive)}
                    className="btn btn-ghost btn-sm"
                  >
                    {webhook.isActive ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => deleteWebhook(webhook.id)}
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
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </div>
            <p>No webhooks configured</p>
            <p className="text-sm mt-1">Add a webhook to receive notifications</p>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <h3 className="text-xl font-display font-semibold mb-4">Add Webhook</h3>

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
                <label className="block text-sm font-medium mb-2">Events</label>
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
                      <span className="text-sm">{event.label}</span>
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
          </div>
        </div>
      )}

      {/* Test Modal */}
      {showTestModal && testWebhook && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <h3 className="text-xl font-display font-semibold mb-4">Test Webhook</h3>

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
                className={`p-4 rounded-lg ${testResult.includes("success") ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}
              >
                <p className="text-sm">{testResult}</p>
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
          </div>
        </div>
      )}
    </div>
  );
}
