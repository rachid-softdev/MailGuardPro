"use client";

import { useEffect, useRef } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * Calls `refetch` when the user transitions from offline to online.
 * Useful for pages that should re-fetch data after connectivity is restored.
 */
export function useOnlineStatusSync(refetch: () => void): void {
  const { isOnline } = useOnlineStatus();
  const wasOfflineRef = useRef(false);
  const refetchRef = useRef(refetch);

  // Keep the refetch ref in sync without re-triggering the effect
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
    } else if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      refetchRef.current();
    }
  }, [isOnline]);
}
