interface StatusBadgeProps {
  status: 'valid' | 'invalid' | 'risky' | 'unknown'
  showDot?: boolean
}

const statusConfig = {
  valid: { 
    label: 'VALID', 
    color: 'var(--status-valid)', 
    bg: 'var(--status-valid-bg)',
    dotColor: 'var(--status-valid)'
  },
  invalid: { 
    label: 'INVALID', 
    color: 'var(--status-invalid)', 
    bg: 'var(--status-invalid-bg)',
    dotColor: 'var(--status-invalid)'
  },
  risky: { 
    label: 'RISKY', 
    color: 'var(--status-risky)', 
    bg: 'var(--status-risky-bg)',
    dotColor: 'var(--status-risky)'
  },
  unknown: { 
    label: 'UNKNOWN', 
    color: 'var(--status-unknown)', 
    bg: 'var(--status-unknown-bg)',
    dotColor: 'var(--status-unknown)'
  },
}

export function StatusBadge({ status, showDot = true }: StatusBadgeProps) {
  const config = statusConfig[status]
  
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono uppercase tracking-widest"
      style={{ 
        backgroundColor: config.bg, 
        color: config.color,
        letterSpacing: '0.12em'
      }}
      role="status"
      aria-label={`Email status: ${config.label}`}
    >
      {showDot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${status === 'valid' ? 'animate-pulse-dot' : ''}`}
          style={{ backgroundColor: config.dotColor }}
        />
      )}
      {config.label}
    </span>
  )
}