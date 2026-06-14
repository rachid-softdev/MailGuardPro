"use client";

import { useCallback } from "react";
import { useErrorToast } from "@/hooks/useErrorToast";

export function useApiWithToast() {
  const { addToast } = useErrorToast();

  const fetchWithToast = useCallback(
    async (url: string, options?: RequestInit) => {
      try {
        const res = await fetch(url, options);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          addToast({
            type: "error",
            title: `Request failed (${res.status})`,
            message: data.error || `Failed to ${options?.method || "fetch"} ${url}`,
          });
        }
        return res;
      } catch {
        addToast({
          type: "error",
          title: "Network error",
          message: "Could not connect to the server. Please check your connection.",
          onRetry: () => fetch(url, options),
        });
        return null;
      }
    },
    [addToast],
  );

  return { fetchWithToast };
}
