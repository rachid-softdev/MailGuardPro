'use client'

import { useEffect, useState } from 'react'

interface ScoreCircleProps {
  score: number
  size?: 'sm' | 'md' | 'lg' | 'xl'
  animated?: boolean
}

const sizes = {
  sm: { diameter: 56, strokeWidth: 4 },
  md: { diameter: 80, strokeWidth: 5 },
  lg: { diameter: 120, strokeWidth: 6 },
  xl: { diameter: 180, strokeWidth: 8 },
}

function getScoreColor(score: number): string {
  if (score <= 25) return 'var(--score-critical)'
  if (score <= 40) return 'var(--score-poor)'
  if (score <= 60) return 'var(--score-medium)'
  if (score <= 75) return 'var(--score-good)'
  return 'var(--score-excellent)'
}

export function ScoreCircle({ score, size = 'md', animated = true }: ScoreCircleProps) {
  const [displayScore, setDisplayScore] = useState(animated ? 0 : score)
  const { diameter, strokeWidth } = sizes[size]
  const radius = (diameter - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (displayScore / 100) * circumference
  const color = getScoreColor(score)
  
  useEffect(() => {
    if (!animated) return
    
    const duration = 600
    const steps = 30
    const increment = score / steps
    let current = 0
    
    const timer = setInterval(() => {
      current += increment
      if (current >= score) {
        setDisplayScore(score)
        clearInterval(timer)
      } else {
        setDisplayScore(Math.floor(current))
      }
    }, duration / steps)
    
    return () => clearInterval(timer)
  }, [score, animated])
  
  return (
    <div className="relative" style={{ width: diameter, height: diameter }}>
      <svg width={diameter} height={diameter} className="transform -rotate-90">
        {/* Track */}
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          stroke="var(--bg-subtle)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Fill */}
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
          style={{ 
            filter: score > 75 ? 'drop-shadow(0 0 8px var(--accent-glow))' : undefined 
          }}
        />
      </svg>
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <span 
          className="text-center"
          style={{ 
            fontSize: size === 'xl' ? 'var(--text-4xl)' : size === 'lg' ? 'var(--text-2xl)' : 'var(--text-lg)',
            fontWeight: 500
          }}
        >
          {displayScore}
        </span>
      </div>
    </div>
  )
}