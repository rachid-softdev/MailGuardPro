"use client";

import { Wifi, WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * Banner that slides down from the top when the user goes offline,
 * and briefly shows a "back online" message when connectivity returns.
 */
export function OfflineBanner() {
  const { isOnline, wasOffline } = useOnlineStatus();

  const show = !isOnline || wasOffline;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`
        fixed top-0 left-0 right-0 z-30
        flex items-center justify-center gap-2
        px-4 py-2.5 text-sm font-medium
        transition-all duration-300 ease-in-out
        motion-reduce:transition-none
        ${show ? "translate-y-0" : "-translate-y-full"}
      `}
      style={{
        backgroundColor: !isOnline ? "var(--status-risky-bg)" : "var(--status-valid-bg)",
        borderBottom: `1px solid ${!isOnline ? "var(--status-risky)" : "var(--status-valid)"}`,
        color: !isOnline ? "var(--status-risky)" : "var(--status-valid)",
      }}
    >
      {!isOnline ? (
        <>
          <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>You are offline. Some features may be unavailable.</span>
        </>
      ) : (
        <>
          <Wifi className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>You are back online!</span>
        </>
      )}
    </div>
  );
}
