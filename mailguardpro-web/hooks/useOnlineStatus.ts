"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tracks navigator.onLine status with a transient `wasOffline` flag
 * that auto-clears 3 seconds after coming back online.
 */
export function useOnlineStatus(): { isOnline: boolean; wasOffline: boolean } {
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleOnline = useCallback(() => {
    setIsOnline(true);
    setWasOffline(true);
    clearTimer();
    timerRef.current = setTimeout(() => {
      setWasOffline(false);
    }, 3000);
  }, [clearTimer]);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    clearTimer();
  }, [clearTimer]);

  useEffect(() => {
    // Initialise depuis navigator.onLine
    if (typeof navigator !== "undefined") {
      setIsOnline(navigator.onLine);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearTimer();
    };
  }, [handleOnline, handleOffline, clearTimer]);

  return { isOnline, wasOffline };
}
