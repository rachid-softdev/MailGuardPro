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

export function ThemeToggle() {
  const { theme, cycleTheme } = useTheme();
  const Icon = icons[theme];

  return (
    <Tooltip content={`${labels[theme]} — next: ${labels[nextLabel[theme]]}`} side="top">
      <button
        onClick={cycleTheme}
        className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors"
        aria-label={`Current: ${labels[theme]}. Click to switch to ${labels[nextLabel[theme]]}.`}
      >
        <Icon size={14} aria-hidden="true" />
        <span className="hidden sm:inline capitalize">{theme}</span>
      </button>
    </Tooltip>
  );
}
