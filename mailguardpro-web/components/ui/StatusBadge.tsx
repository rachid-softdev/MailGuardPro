"use client";

import { Tooltip } from "@/components/ui/Tooltip";

interface StatusBadgeProps {
  status: "valid" | "invalid" | "risky" | "unknown";
  showDot?: boolean;
}

const statusConfig = {
  valid: {
    label: "VALID",
    color: "var(--status-valid-text)",
    bg: "var(--status-valid-bg)",
    dotColor: "var(--status-valid)",
    help: "The format, MX, and SMTP checks passed. Treat this as high confidence, not a guarantee.",
  },
  invalid: {
    label: "INVALID",
    color: "var(--status-invalid-text)",
    bg: "var(--status-invalid-bg)",
    dotColor: "var(--status-invalid)",
    help: "A hard check failed — format, disposable domain, or SMTP rejection. Remove this address from your list.",
  },
  risky: {
    label: "RISKY",
    color: "var(--status-risky-text)",
    bg: "var(--status-risky-bg)",
    dotColor: "var(--status-risky)",
    help: "Email may exist but has issues — catch-all domain, temporary inbox, or low reputation. Proceed with caution.",
  },
  unknown: {
    label: "UNKNOWN",
    color: "var(--status-unknown-text)",
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
        className="inline-flex items-center gap-1 rounded-[1px] border border-current px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase leading-relaxed tracking-[0.06em]"
        style={{
          backgroundColor: config.bg,
          color: config.color,
        }}
        role="status"
        aria-label={`Email status: ${config.label}. ${config.help}`}
      >
        {showDot && (
          <span
            className={`h-1 w-1 rounded-full ${status === "valid" ? "animate-pulse-dot" : ""}`}
            style={{ backgroundColor: config.dotColor }}
            aria-hidden="true"
          />
        )}
        {config.label}
      </span>
    </Tooltip>
  );
}
