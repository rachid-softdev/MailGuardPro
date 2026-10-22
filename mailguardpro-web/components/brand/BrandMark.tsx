import { cn } from "@/lib/cn";

interface BrandMarkProps {
  size?: number;
  className?: string;
}

/**
 * A postage-stamp monogram: solid ink block, reversed M, signal-orange corner.
 * Drawn as one SVG so it stays crisp and currentColor adapts to the theme.
 */
export function BrandMark({ size = 24, className }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="1" y="1" width="22" height="22" fill="currentColor" />
        <path
          d="M5.5 18V6h2.4L12 13.1 16.1 6h2.4v12h-2.35V10.2L12 16.7l-4.15-6.5V18H5.5Z"
          fill="var(--bg)"
        />
        <rect x="17" y="3" width="4" height="4" fill="var(--accent)" />
      </svg>
    </span>
  );
}

interface WordmarkProps {
  size?: "sm" | "md";
  className?: string;
  mark?: boolean;
}

export function Wordmark({ size = "md", className, mark = true }: WordmarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {mark && <BrandMark size={size === "sm" ? 19 : 23} className="text-[var(--ink)]" />}
      <span className="inline-flex items-baseline gap-1.5">
        <span
          className={cn(
            "font-display font-extrabold uppercase leading-none tracking-[0.065em] text-[var(--ink)]",
            size === "sm" ? "text-[12px]" : "text-[13px]",
          )}
        >
          Mailguard
        </span>
        <span
          className={cn(
            "border border-[var(--line-strong)] px-1 py-[2px] font-mono font-semibold uppercase leading-none tracking-[0.09em] text-[var(--ink-3)]",
            size === "sm" ? "text-[7px]" : "text-[8px]",
          )}
        >
          Pro
        </span>
      </span>
    </span>
  );
}
