"use client";

import { useCallback, useRef, useState } from "react";
import type { UndoToastItem } from "./types";
import type { ShowUndoParams } from "./useUndo";
import { UndoContext } from "./useUndo";

let nextToastId = 1;

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<UndoToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showUndo = useCallback(
    (params: ShowUndoParams): string => {
      const id = `undo-${nextToastId++}`;
      const duration = params.duration ?? 5000;
      const expiresAt = new Date(Date.now() + duration);
      const actionLabel = params.actionLabel ?? "Undo";

      const toast: UndoToastItem = {
        id,
        message: params.message,
        actionLabel,
        onAction: params.onAction,
        expiresAt,
        onExpire: params.onExpire ?? (() => {}),
      };

      setToasts((prev) => [...prev, toast]);

      const timer = setTimeout(() => {
        toast.onExpire();
        removeToast(id);
      }, duration);
      timersRef.current.set(id, timer);

      return id;
    },
    [removeToast],
  );

  return (
    <UndoContext.Provider value={{ toasts, showUndo, dismissToast: removeToast }}>
      {children}
    </UndoContext.Provider>
  );
}
