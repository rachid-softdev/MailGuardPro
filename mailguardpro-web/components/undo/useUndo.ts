"use client";

import { createContext, useContext } from "react";
import type { UndoToastItem } from "./types";

export interface ShowUndoParams {
  message: string;
  actionLabel?: string;
  onAction: () => Promise<void> | void;
  onExpire?: () => void;
  duration?: number;
}

export interface UndoContextValue {
  toasts: UndoToastItem[];
  showUndo: (params: ShowUndoParams) => string;
  dismissToast: (id: string) => void;
}

export const UndoContext = createContext<UndoContextValue | null>(null);

export function useUndo(): UndoContextValue {
  const ctx = useContext(UndoContext);
  if (!ctx) {
    throw new Error("useUndo must be used within UndoProvider");
  }
  return ctx;
}
