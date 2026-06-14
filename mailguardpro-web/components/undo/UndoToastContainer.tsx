"use client";

import { UndoToast } from "./UndoToast";
import { useUndo } from "./useUndo";

export function UndoToastContainer() {
  const { toasts, dismissToast } = useUndo();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[45] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <UndoToast item={item} onDismiss={dismissToast} />
        </div>
      ))}
    </div>
  );
}
