"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

interface UndoEntry {
  id: string;
  label: string;
  undo: () => void;
  redo: () => void;
}

interface UndoHistoryValue {
  /** Register an undoable action */
  pushUndo: (entry: Omit<UndoEntry, "id">) => string;
  /** Undo the most recent action */
  undo: () => void;
  /** Redo the last undone action */
  redo: () => void;
  /** Whether there are actions to undo */
  canUndo: boolean;
  /** Whether there are actions to redo */
  canRedo: boolean;
  /** Label of the next undoable action (for tooltip) */
  nextUndoLabel: string | null;
  /** Label of the next redoable action (for tooltip) */
  nextRedoLabel: string | null;
}

const MAX_STACK = 50;

const UndoHistoryContext = createContext<UndoHistoryValue | null>(null);

let globalId = 0;

export function UndoHistoryProvider({ children }: { children: React.ReactNode }) {
  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);
  const [version, setVersion] = useState(0);

  const pushUndo = useCallback((entry: Omit<UndoEntry, "id">) => {
    const id = `undo-${++globalId}`;
    const full: UndoEntry = { ...entry, id };
    undoStack.current.push(full);
    if (undoStack.current.length > MAX_STACK) {
      undoStack.current.shift();
    }
    // Clear redo stack on new action (standard undo behavior)
    redoStack.current = [];
    setVersion((v) => v + 1);
    return id;
  }, []);

  const undo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    entry.undo();
    redoStack.current.push(entry);
    setVersion((v) => v + 1);
  }, []);

  const redo = useCallback(() => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    entry.redo();
    undoStack.current.push(entry);
    setVersion((v) => v + 1);
  }, []);

  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;
  const nextUndoLabel = canUndo ? undoStack.current[undoStack.current.length - 1].label : null;
  const nextRedoLabel = canRedo ? redoStack.current[redoStack.current.length - 1].label : null;

  // Consume version to trigger re-renders
  void version;

  return (
    <UndoHistoryContext.Provider
      value={{ pushUndo, undo, redo, canUndo, canRedo, nextUndoLabel, nextRedoLabel }}
    >
      {children}
    </UndoHistoryContext.Provider>
  );
}

export function useUndoHistory(): UndoHistoryValue {
  const ctx = useContext(UndoHistoryContext);
  if (!ctx) throw new Error("useUndoHistory must be used within UndoHistoryProvider");
  return ctx;
}
