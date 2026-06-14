"use client";

import { createContext, useContext, useMemo } from "react";

interface ABTestContextValue {
  variant: "A" | "B";
  isControl: boolean;
}

const ABTestContext = createContext<ABTestContextValue | null>(null);

const STORAGE_KEY = "mg-landing-variant";

function getVariant(): "A" | "B" {
  if (typeof window === "undefined") return "A";
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored === "A" || stored === "B") return stored;
  const variant: "A" | "B" = Math.random() < 0.5 ? "A" : "B";
  sessionStorage.setItem(STORAGE_KEY, variant);
  return variant;
}

export function ABTestProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo(() => {
    const variant = getVariant();
    return { variant, isControl: variant === "A" };
  }, []);

  return <ABTestContext.Provider value={value}>{children}</ABTestContext.Provider>;
}

export function useABTest(): ABTestContextValue {
  const ctx = useContext(ABTestContext);
  if (!ctx) {
    throw new Error("useABTest must be used within ABTestProvider");
  }
  return ctx;
}
