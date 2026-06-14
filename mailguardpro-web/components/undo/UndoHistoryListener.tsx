"use client";

import { useEffect } from "react";
import { useUndoHistory } from "@/hooks/useUndoHistory";

/**
 * Listens for Ctrl+Z (undo) and Ctrl+Shift+Z / Ctrl+Y (redo).
 * Renders nothing — just attaches a keyboard listener.
 */
export function UndoHistoryListener() {
  const { undo, redo, canUndo, canRedo } = useUndoHistory();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea/contenteditable
      const target = e.target as HTMLElement;
      const isEditable =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (!(e.metaKey || e.ctrlKey)) return;

      // Ctrl+Z → undo (unless in editable field, where browser handles it)
      if (e.key === "z" && !e.shiftKey) {
        if (!isEditable && canUndo) {
          e.preventDefault();
          undo();
        }
        return;
      }

      // Ctrl+Shift+Z or Ctrl+Y → redo
      if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        if (!isEditable && canRedo) {
          e.preventDefault();
          redo();
        }
        return;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);

  return null;
}
