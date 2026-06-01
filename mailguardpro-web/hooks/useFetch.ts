"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Generic fetch hook with abort controller cleanup and refetch capability.
 *
 * @param url - The URL to fetch from. Pass null to skip fetching.
 * @param options - Standard fetch options (method, headers, body, etc.)
 */
export function useFetch<T = unknown>(
  url: string | null,
  options?: RequestInit,
): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const execute = useCallback(() => {
    if (!url) return;

    // Cancel any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    fetch(url, { ...options, signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        const json = (await res.json()) as T;
        if (!controller.signal.aborted) {
          setData(json);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, JSON.stringify(options)]);

  useEffect(() => {
    execute();
  }, [execute]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  return { data, loading, error, refetch: execute };
}
