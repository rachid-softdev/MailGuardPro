"use client";

import { useCallback, useState } from "react";
import { useUndo } from "@/components/undo/useUndo";
import { logger } from "@/lib/logger";

export interface UseUndoDeleteOptions {
  /** URL for deletion. Can be a function taking the resource ID. */
  deleteEndpoint: string | ((id: string) => string);
  /** URL for restoration. Can be a function taking the resource ID. */
  restoreEndpoint: string | ((id: string) => string);
  /** Called after successful undo (restore) */
  onRestored?: () => void;
  /** Called when the undo window expires (deletion confirmed) */
  onExpired?: () => void;
  /** Returns the toast message. Receives the metadata name. */
  getMessage?: (name: string) => string;
}

export interface UseUndoDeleteReturn {
  deleteResource: (id: string, metadata: { name: string }) => Promise<void>;
  isDeleting: boolean;
}

export function useUndoDelete(options: UseUndoDeleteOptions): UseUndoDeleteReturn {
  const { showUndo } = useUndo();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteResource = useCallback(
    async (id: string, metadata: { name: string }) => {
      setIsDeleting(true);
      try {
        const deleteUrl =
          typeof options.deleteEndpoint === "function"
            ? options.deleteEndpoint(id)
            : options.deleteEndpoint;

        const res = await fetch(deleteUrl, { method: "DELETE" });

        let data: { success?: boolean; error?: string; undoable?: boolean } | null = null;
        try {
          data = await res.json();
        } catch {
          // Response was not JSON — network or server error
        }

        if (!data?.success) {
          // Surface error: show a toast-like message via an onError callback
          logger.error({ status: res.status }, "Delete request failed");
          return;
        }

        const message = options.getMessage
          ? options.getMessage(metadata.name)
          : `Deleted "${metadata.name}"`;

        showUndo({
          message,
          onAction: async () => {
            const restoreUrl =
              typeof options.restoreEndpoint === "function"
                ? options.restoreEndpoint(id)
                : options.restoreEndpoint;

            try {
              const restoreRes = await fetch(restoreUrl, { method: "POST" });
              if (restoreRes.ok) {
                options.onRestored?.();
              }
            } catch {
              logger.error({}, "Restore request failed");
            }
          },
          onExpire: () => {
            options.onExpired?.();
          },
        });
      } finally {
        setIsDeleting(false);
      }
    },
    [options, showUndo],
  );

  return { deleteResource, isDeleting };
}
