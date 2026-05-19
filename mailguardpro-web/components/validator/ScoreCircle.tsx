"use client";

import { memo, useMemo } from "react";

interface ScoreCircleProps {
  score: number;
  size?: "sm" | "md" | "lg" | "xl";
  animated?: boolean;
}

const sizeConfig = {
  sm: { diameter: 56, strokeWidth: 4, fontSize: "var(--text-base)" },
  md: { diameter: 80, strokeWidth: 5, fontSize: "var(--text-lg)" },
  lg: { diameter: 120, strokeWidth: 6, fontSize: "var(--text-2xl)" },
  xl: { diameter: 180, strokeWidth: 8, fontSize: "var(--text-4xl)" },
};

function getScoreColor(score: number): string {
  if (score <= 25) return "var(--score-critical)";
  if (score <= 40) return "var(--score-poor)";
  if (score <= 60) return "var(--score-medium)";
  if (score <= 75) return "var(--score-good)";
  return "var(--score-excellent)";
}

// Composant pur - sans state, juste du CSS pour l'animation
function ScoreCircleBase({ score, size = "md", animated = true }: ScoreCircleProps) {
  const { diameter, strokeWidth, fontSize } = sizeConfig[size];
  const radius = (diameter - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Calculer l'offset final (100% = score de 100)
  const targetOffset = circumference - (score / 100) * circumference;
  const color = getScoreColor(score);

  // Style pour le glow sur les bons scores
  const glowStyle =
    score > 75
      ? {
          filter: "drop-shadow(0 0 8px var(--accent-glow))",
        }
      : undefined;

  return (
    <div
      className="relative"
      style={{
        width: diameter,
        height: diameter,
        // CSS pour prefers-reduced-motion
        animation: animated ? "none" : undefined,
      }}
    >
      <svg width={diameter} height={diameter} className="transform -rotate-90">
        {/* Track (background circle) */}
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          stroke="var(--bg-subtle)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Fill (progress circle) */}
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          // Animation CSS au lieu de JS - plus performant!
          style={{
            strokeDashoffset: animated ? circumference : targetOffset,
            transition: animated ? "stroke-dashoffset 600ms cubic-bezier(0.4, 0, 0.2, 1)" : "none",
            ...glowStyle,
          }}
        />
      </svg>
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          fontFamily: "var(--font-mono)",
          // Animation du texte aussi
          animation: animated ? "fadeIn 300ms ease-out" : "none",
        }}
      >
        <span
          className="text-center"
          style={{
            fontSize,
            fontWeight: 500,
          }}
        >
          {score}
        </span>
      </div>
    </div>
  );
}

// Memoize le composant pour éviter les re-renders inutiles
// Custom comparison: re-render seulement si score ou size changent
export const ScoreCircle = memo(ScoreCircleBase, (prevProps, nextProps) => {
  return prevProps.score === nextProps.score && prevProps.size === nextProps.size;
});

// Alternative avec hook pour prefers-reduced-motion (si besoin plus tard)
/*
import { useState, useEffect } from 'react'

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)

    const handler = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  return prefersReducedMotion
}
*/
