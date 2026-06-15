"use client";

import { Search } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import type { Command } from "./types";
import { useCommandPalette } from "./useCommandPalette";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const { filteredCommands, query, setQuery, selectedIndex, setSelectedIndex } =
    useCommandPalette();

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input when palette opens
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Reset state when palette opens
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen, setQuery, setSelectedIndex]);

  // Document-level Escape handler
  useEffect(() => {
    if (!isOpen) return;
    const handleDocumentKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleDocumentKey);
    return () => document.removeEventListener("keydown", handleDocumentKey);
  }, [isOpen, onClose]);

  const executeSelected = useCallback(() => {
    const command = filteredCommands[selectedIndex];
    if (command) {
      command.handler();
      onClose();
    }
  }, [filteredCommands, selectedIndex, onClose]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (filteredCommands.length > 0) {
            setSelectedIndex((prev) => (prev < filteredCommands.length - 1 ? prev + 1 : 0));
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (filteredCommands.length > 0) {
            setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredCommands.length - 1));
          }
          break;
        case "Enter":
          e.preventDefault();
          executeSelected();
          break;
      }
    },
    [filteredCommands.length, executeSelected, setSelectedIndex],
  );

  const navigationCommands = filteredCommands.filter((c) => c.category === "navigation");
  const actionCommands = filteredCommands.filter((c) => c.category === "actions");

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative bg-[var(--bg-surface)] border border-[var(--border)] rounded-[var(--radius-xl)] shadow-[var(--shadow-xl)] w-full max-w-md mx-4 overflow-hidden"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
          <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
            aria-label="Search commands"
          />
        </div>

        {/* Command list */}
        <div className="max-h-80 overflow-y-auto p-2">
          {filteredCommands.length === 0 && (
            <p className="text-sm text-[var(--text-muted)] text-center py-8">No commands found</p>
          )}

          {navigationCommands.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] uppercase ">
                Navigation
              </div>
              {navigationCommands.map((cmd, i) => (
                <CommandItem
                  key={cmd.id}
                  command={cmd}
                  isSelected={i === selectedIndex}
                  onSelect={() => {
                    cmd.handler();
                    onClose();
                  }}
                />
              ))}
            </div>
          )}

          {navigationCommands.length > 0 && actionCommands.length > 0 && (
            <div className="border-t border-[var(--border)] mt-1 pt-1" />
          )}

          {actionCommands.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] uppercase ">
                Actions
              </div>
              {actionCommands.map((cmd, i) => (
                <CommandItem
                  key={cmd.id}
                  command={cmd}
                  isSelected={navigationCommands.length + i === selectedIndex}
                  onSelect={() => {
                    cmd.handler();
                    onClose();
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2.5 border-t border-[var(--border)] bg-[var(--bg-elevated)]">
          <p className="text-xs text-[var(--text-muted)]">
            <kbd className="font-mono text-[var(--text-secondary)]">↑↓</kbd> Navigate{" "}
            <kbd className="font-mono text-[var(--text-secondary)] ml-2">↵</kbd> Open{" "}
            <kbd className="font-mono text-[var(--text-secondary)] ml-2">Esc</kbd> Close
          </p>
        </div>
      </div>
    </div>
  );
}

interface CommandItemProps {
  command: Command;
  isSelected: boolean;
  onSelect: () => void;
}

function CommandItem({ command, isSelected, onSelect }: CommandItemProps) {
  const Icon = command.icon;
  const shortcut = command.shortcut;

  return (
    <button
      className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-[var(--radius-md)] text-left transition-colors ${
        isSelected
          ? "bg-[var(--accent)]/10 text-[var(--accent)]"
          : "text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
      }`}
      onClick={onSelect}
      role="option"
      aria-selected={isSelected}
    >
      {Icon && <Icon size={16} className="shrink-0" aria-hidden="true" />}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{command.label}</div>
        <div
          className={`text-xs truncate ${
            isSelected ? "text-[var(--accent)]/70" : "text-[var(--text-muted)]"
          }`}
        >
          {command.description}
        </div>
      </div>
      {shortcut && (
        <kbd className="shrink-0 inline-flex items-center justify-center min-w-[22px] h-6 px-1.5 text-[11px] font-mono font-medium bg-[var(--bg-subtle)] border border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--text-secondary)]">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}
