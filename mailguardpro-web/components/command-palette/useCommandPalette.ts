"use client";

import { get as levenshteinDistance } from "fast-levenshtein";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { allCommandDefs, type CommandDef } from "./commands";
import type { Command } from "./types";

const FILTER_THRESHOLD = 5;

const NAVIGATION_PATHS: Record<string, string> = {
  "nav-dashboard": "/dashboard",
  "nav-validate": "/validate",
  "nav-bulk": "/bulk",
  "nav-history": "/history",
  "nav-api-keys": "/api-keys",
  "nav-webhooks": "/webhooks",
  "nav-settings": "/settings",
  "action-create-api-key": "/api-keys",
  "action-new-validation": "/validate",
  "action-bulk-upload": "/bulk",
};

function scoreCommand(command: CommandDef, query: string): number {
  const lowerQuery = query.toLowerCase();
  const haystack = [command.label, command.description, ...command.keywords].map((s) =>
    s.toLowerCase(),
  );
  if (haystack.some((s) => s.startsWith(lowerQuery))) return 0;
  return levenshteinDistance(command.label.toLowerCase(), lowerQuery);
}

function buildCommands(router: ReturnType<typeof useRouter>): Command[] {
  return allCommandDefs.map((def) => ({
    ...def,
    handler: () => {
      const path = NAVIGATION_PATHS[def.id];
      if (path) router.push(path);
    },
  }));
}

export function useCommandPalette() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands = useMemo(() => buildCommands(router), [router]);

  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      return commands;
    }

    return commands
      .map((cmd) => ({ cmd, score: scoreCommand(cmd, query) }))
      .filter(({ score }) => score <= FILTER_THRESHOLD)
      .sort((a, b) => a.score - b.score)
      .map(({ cmd }) => cmd);
  }, [commands, query]);

  // Clamp selected index when filtered list changes size
  useEffect(() => {
    setSelectedIndex((prev) => {
      if (filteredCommands.length === 0) return 0;
      return Math.min(prev, filteredCommands.length - 1);
    });
  }, [filteredCommands.length]);

  return {
    commands,
    filteredCommands,
    query,
    setQuery,
    selectedIndex,
    setSelectedIndex,
  };
}
