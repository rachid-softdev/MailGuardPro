"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface Shortcut {
  key: string;
  label: string;
  description: string;
  action: () => void;
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
};

export function useKeyboardShortcuts() {
  const router = useRouter();
  const [showPalette, setShowPalette] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  const shortcuts: Shortcut[] = [
    {
      key: "d",
      label: "D",
      description: "Go to Dashboard",
      action: () => router.push("/dashboard"),
    },
    {
      key: "v",
      label: "V",
      description: "Go to Validate",
      action: () => router.push("/validate"),
    },
    {
      key: "b",
      label: "B",
      description: "Go to Bulk",
      action: () => router.push("/bulk"),
    },
    {
      key: "h",
      label: "H",
      description: "Go to History",
      action: () => router.push("/history"),
    },
    {
      key: "k",
      label: "K",
      description: "Go to API Keys",
      action: () => router.push("/api-keys"),
    },
    {
      key: "w",
      label: "W",
      description: "Go to Webhooks",
      action: () => router.push("/webhooks"),
    },
    {
      key: "s",
      label: "S",
      description: "Go to Settings",
      action: () => router.push("/settings"),
    },
    {
      key: "/",
      label: "/",
      description: "Focus search or primary input",
      action: () => {
        // Try to find and focus the primary input on the current page
        const primaryInput = document.querySelector<HTMLElement>(
          'input[type="email"], input[type="text"][placeholder*="earch"], input[type="text"][placeholder*="email"]',
        );
        primaryInput?.focus();
      },
    },
  ];

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Cmd+K / Ctrl+K toggles command palette (works everywhere, even in inputs)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
        return;
      }

      // Don't trigger shortcuts when typing in inputs
      if (isEditableTarget(e.target)) return;

      // Don't trigger when modifier keys are held
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // When command palette is open, only Escape is handled here
      if (showCommandPalette) {
        if (e.key === "Escape") {
          setShowCommandPalette(false);
        }
        return;
      }

      // Show shortcuts palette on ?
      if (e.key === "?") {
        e.preventDefault();
        setShowPalette((prev) => !prev);
        return;
      }

      // Escape closes shortcuts palette
      if (e.key === "Escape") {
        setShowPalette(false);
        return;
      }

      const shortcut = shortcuts.find((s) => s.key === e.key);
      if (shortcut) {
        e.preventDefault();
        shortcut.action();
      }
    },
    [router, shortcuts, showCommandPalette],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return { showPalette, setShowPalette, showCommandPalette, setShowCommandPalette };
}

export type { Shortcut };
