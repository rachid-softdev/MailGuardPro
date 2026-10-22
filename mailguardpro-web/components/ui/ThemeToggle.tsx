"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { useTheme } from "@/hooks/useTheme";

const icons = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const labels = {
  light: "Light mode",
  dark: "Dark mode",
  system: "System theme",
};

const nextLabel = {
  light: "dark" as const,
  dark: "system" as const,
  system: "light" as const,
};

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, cycleTheme } = useTheme();
  const Icon = icons[theme];

  return (
    <Tooltip content={`${labels[theme]} — next: ${labels[nextLabel[theme]]}`} side="top">
      <button
        onClick={cycleTheme}
        className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] px-2 text-xs text-[var(--ink-3)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
        aria-label={`Current: ${labels[theme]}. Click to switch to ${labels[nextLabel[theme]]}.`}
      >
        <Icon size={14} aria-hidden="true" />
        {!compact && <span className="hidden capitalize sm:inline">{theme}</span>}
      </button>
    </Tooltip>
  );
}
