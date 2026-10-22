"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { clampScore, getScoreBand, SCORE_BANDS } from "@/lib/score";

interface ScoreGaugeProps {
  score: number;
  label?: string;
  showScale?: boolean;
  showBand?: boolean;
  animate?: boolean;
  className?: string;
}

/**
 * The instrument: a 0–100 horizontal scale with five calibrated bands and a
 * physical needle. The number stays in ink; the band carries the verdict.
 */
export function ScoreGauge({
  score,
  label = "Quality score",
  showScale = true,
  showBand = true,
  animate = true,
  className,
}: ScoreGaugeProps) {
  const target = clampScore(score);
  const [displayed, setDisplayed] = useState(animate ? 0 : target);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!animate || reduced) {
      setDisplayed(target);
      return;
    }

    const frame = requestAnimationFrame(() => setDisplayed(target));
    return () => cancelAnimationFrame(frame);
  }, [target, animate]);

  const band = getScoreBand(target);

  return (
    <div
      className={cn("w-full", className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={target}
      aria-label={`${label}: ${target} out of 100. ${band.label}.`}
    >
      <div className="flex items-end justify-between gap-5">
        <div className="min-w-0">
          <p className="label-mono mb-1.5">{label}</p>
          <div className="flex items-baseline gap-1.5">
            <span
              className="font-display text-5xl font-semibold leading-none tracking-[-0.045em] text-[var(--ink)] tabular sm:text-6xl"
              aria-hidden="true"
            >
              {displayed}
            </span>
            <span className="font-mono text-[11px] text-[var(--ink-3)]">/ 100</span>
          </div>
        </div>

        {showBand && (
          <div className="shrink-0 pb-0.5 text-right">
            <span
              className="stamp"
              style={{
                color: band.textColor,
                borderColor: "currentColor",
                backgroundColor: "var(--surface)",
              }}
            >
              {band.short}
            </span>
            <p className="mt-1.5 max-w-[14ch] text-[11px] leading-tight text-[var(--ink-2)]">
              {band.label}
            </p>
          </div>
        )}
      </div>

      <div className="relative mt-4 pt-1.5">
        <div className="flex h-2.5 w-full gap-[2px]" aria-hidden="true">
          {SCORE_BANDS.map((segment) => {
            const active = segment.short === band.short;
            return (
              <div
                key={segment.short}
                style={{
                  width: `${segment.span}%`,
                  backgroundColor: segment.color,
                  opacity: active ? 0.95 : 0.22,
                  transition: "opacity 300ms var(--ease-out-quart)",
                }}
              />
            );
          })}
        </div>

        {/* Needle */}
        <div
          aria-hidden="true"
          className="absolute top-0 h-5 w-[2px] -translate-x-1/2 bg-[var(--ink)] transition-[left] duration-700 ease-[var(--ease-out-expo)]"
          style={{ left: `${displayed}%` }}
        >
          <span className="absolute -left-[3px] top-0 h-0 w-0 border-x-[4px] border-t-[4px] border-x-transparent border-t-[var(--ink)]" />
        </div>

        {showScale && (
          <div className="mt-2 flex justify-between font-mono text-[9px] leading-none text-[var(--ink-3)]">
            <span>0</span>
            <span>25</span>
            <span>50</span>
            <span>75</span>
            <span>100</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface ScoreMeterProps {
  score: number;
  className?: string;
  showNumber?: boolean;
}

/** Compact inline reading for ledgers and tables. */
export function ScoreMeter({ score, className, showNumber = true }: ScoreMeterProps) {
  const value = clampScore(score);
  const band = getScoreBand(value);

  return (
    <span
      className={cn("inline-flex items-center gap-2", className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={`Quality score: ${value} out of 100`}
    >
      {showNumber && (
        <span className="w-[22px] text-right font-mono text-[11px] font-medium leading-none text-[var(--ink)] tabular">
          {value}
        </span>
      )}
      <span className="block h-[3px] w-10 bg-[var(--surface-3)]" aria-hidden="true">
        <span
          className="block h-full"
          style={{ width: `${value}%`, backgroundColor: band.color }}
        />
      </span>
    </span>
  );
}
