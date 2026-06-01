"use client";

import { useCallback, useEffect, useRef } from "react";

interface UsePollingOptions<T> {
  fetcher: () => Promise<T>;
  shouldStop: (result: T) => boolean;
  interval?: number; // Intervalle de base en ms (défaut: 2000)
  maxRetries?: number; // Max tentatives avant arrêt (défaut: 50 ≈ 5min)
  enabled?: boolean; // Activation/désactivation
  onError?: (error: Error) => void;
  onComplete?: (result: T) => void;
}

interface UsePollingReturn {
  cancel: () => void;
  isPolling: boolean;
}

export function usePolling<T>({
  fetcher,
  shouldStop,
  interval = 2000,
  maxRetries = 50,
  enabled = true,
  onError,
  onComplete,
}: UsePollingOptions<T>): UsePollingReturn {
  const retryCount = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mountedRef = useRef(true);
  const isPollingRef = useRef(false);
  const fetcherRef = useRef(fetcher);
  const shouldStopRef = useRef(shouldStop);
  const onErrorRef = useRef(onError);
  const onCompleteRef = useRef(onComplete);

  // Keep refs up to date
  fetcherRef.current = fetcher;
  shouldStopRef.current = shouldStop;
  onErrorRef.current = onError;
  onCompleteRef.current = onComplete;

  const poll = useCallback(async () => {
    if (!mountedRef.current || retryCount.current >= maxRetries) {
      isPollingRef.current = false;
      return;
    }

    try {
      const result = await fetcherRef.current();
      retryCount.current = 0; // Reset success counter

      if (shouldStopRef.current(result)) {
        isPollingRef.current = false;
        onCompleteRef.current?.(result);
        return;
      }

      // Schedule next poll
      timeoutRef.current = setTimeout(poll, interval);
    } catch (error) {
      retryCount.current++;
      onErrorRef.current?.(error as Error);

      if (retryCount.current >= maxRetries) {
        isPollingRef.current = false;
        return;
      }

      // Exponential backoff: 2s, 4s, 8s, 16s... cap at 30s
      const backoff = Math.min(interval * Math.pow(2, retryCount.current - 1), 30000);
      timeoutRef.current = setTimeout(poll, backoff);
    }
  }, [interval, maxRetries]);

  useEffect(() => {
    if (!enabled) return;

    mountedRef.current = true;
    isPollingRef.current = true;
    retryCount.current = 0;

    // Start poll cycle immediately
    timeoutRef.current = setTimeout(poll, 0);

    return () => {
      mountedRef.current = false;
      isPollingRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, poll]);

  return {
    cancel: () => {
      mountedRef.current = false;
      isPollingRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    },
    get isPolling() {
      return isPollingRef.current;
    },
  };
}
