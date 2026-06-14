"use client";

import { useId, useRef, useState } from "react";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  /** Place the tooltip above, below, left, or right of the trigger */
  side?: "top" | "bottom" | "left" | "right";
  /** Optional keyboard shortcut hint shown in the tooltip */
  shortcut?: string;
}

export function Tooltip({ content, children, side = "top", shortcut }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = () => {
    clearTimeout(timeoutRef.current);
    setVisible(true);
  };

  const hide = () => {
    timeoutRef.current = setTimeout(() => setVisible(false), 100);
  };

  const sideClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <span aria-describedby={id}>{children}</span>
      {visible && (
        <span
          id={id}
          role="tooltip"
          className={`absolute z-50 pointer-events-none ${sideClasses[side]}`}
        >
          <span className="block px-2.5 py-1.5 text-xs leading-snug bg-[var(--text-primary)] text-[var(--text-inverted)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] whitespace-nowrap max-w-[260px]">
            {content}
            {shortcut && (
              <kbd className="ml-1.5 px-1 py-[1px] text-[10px] font-mono rounded bg-white/20">
                {shortcut}
              </kbd>
            )}
          </span>
        </span>
      )}
    </span>
  );
}
