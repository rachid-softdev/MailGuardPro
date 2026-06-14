"use client";

import { Tooltip } from "@/components/ui/Tooltip";

interface StatusBadgeProps {
  status: "valid" | "invalid" | "risky" | "unknown";
  showDot?: boolean;
}

const statusConfig = {
  valid: {
    label: "VALID",
    color: "var(--status-valid)",
    bg: "var(--status-valid-bg)",
    dotColor: "var(--status-valid)",
    help: "Email exists and is deliverable. High confidence this address is safe to send to.",
  },
  invalid: {
    label: "INVALID",
    color: "var(--status-invalid)",
    bg: "var(--status-invalid-bg)",
    dotColor: "var(--status-invalid)",
    help: "Email does not exist or has been rejected by the mail server. Remove this address from your list.",
  },
  risky: {
    label: "RISKY",
    color: "var(--status-risky)",
    bg: "var(--status-risky-bg)",
    dotColor: "var(--status-risky)",
    help: "Email may exist but has issues — catch-all domain, temporary inbox, or low reputation. Proceed with caution.",
  },
  unknown: {
    label: "UNKNOWN",
    color: "var(--status-unknown)",
    bg: "var(--status-unknown-bg)",
    dotColor: "var(--status-unknown)",
    help: "We could not verify this email (server timeout, rate-limited, or unreachable). Re-check later.",
  },
};

export function StatusBadge({ status, showDot = true }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Tooltip content={config.help} side="top">
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono uppercase tracking-widest"
        style={{
          backgroundColor: config.bg,
          color: config.color,
        }}
        role="status"
        aria-label={`Email status: ${config.label}. ${config.help}`}
      >
        {showDot && (
          <span
            className={`w-1.5 h-1.5 rounded-full ${status === "valid" ? "animate-pulse-dot" : ""}`}
            style={{ backgroundColor: config.dotColor }}
          />
        )}
        {config.label}
      </span>
    </Tooltip>
  );
}
