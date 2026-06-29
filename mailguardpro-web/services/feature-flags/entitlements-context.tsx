"use client";

// ================================================================
// EntitlementsContext — React Context for Feature Flags
// ================================================================

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// ---- Types ----

export interface EntitlementsData {
  plan: string;
  features: Record<string, boolean>;
  limits: Record<string, number | null>;
  configs: Record<string, Record<string, unknown> | null>;
  usage: Record<string, number>;
  reset_at: Record<string, string | null>;
}

interface EntitlementsContextValue {
  entitlements: EntitlementsData | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  hasFeature: (key: string) => boolean;
  getLimit: (key: string) => number | null;
  getUsage: (key: string) => number;
  getResetAt: (key: string) => string | null;
}

// ---- Context ----

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);

// ---- Provider ----

export function EntitlementsProvider({ children }: { children: React.ReactNode }) {
  const [entitlements, setEntitlements] = useState<EntitlementsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchEntitlements = useCallback(async () => {
    // Cancel in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/me/entitlements", {
        signal: controller.signal,
        headers: { "Cache-Control": "no-cache" },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = (await res.json()) as EntitlementsData;
      if (!controller.signal.aborted) {
        setEntitlements(data);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchEntitlements();
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [fetchEntitlements]);

  const hasFeature = useCallback(
    (key: string): boolean => {
      return entitlements?.features?.[key] ?? false;
    },
    [entitlements],
  );

  const getLimit = useCallback(
    (key: string): number | null => {
      return entitlements?.limits?.[key] ?? null;
    },
    [entitlements],
  );

  const getUsage = useCallback(
    (key: string): number => {
      return entitlements?.usage?.[key] ?? 0;
    },
    [entitlements],
  );

  const getResetAt = useCallback(
    (key: string): string | null => {
      return entitlements?.reset_at?.[key] ?? null;
    },
    [entitlements],
  );

  return (
    <EntitlementsContext.Provider
      value={{
        entitlements,
        loading,
        error,
        refetch: fetchEntitlements,
        hasFeature,
        getLimit,
        getUsage,
        getResetAt,
      }}
    >
      {children}
    </EntitlementsContext.Provider>
  );
}

// ---- Hooks ----

export function useEntitlements(): EntitlementsContextValue {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) {
    throw new Error("useEntitlements must be used within an <EntitlementsProvider>");
  }
  return ctx;
}

export function useFeature(featureKey: string): boolean {
  const ctx = useEntitlements();
  return ctx.hasFeature(featureKey);
}

export function useLimit(featureKey: string): {
  limit: number | null;
  used: number;
  resetAt: string | null;
} {
  const ctx = useEntitlements();
  return {
    limit: ctx.getLimit(featureKey),
    used: ctx.getUsage(featureKey),
    resetAt: ctx.getResetAt(featureKey),
  };
}
