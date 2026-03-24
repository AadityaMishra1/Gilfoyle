import React from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info'

export interface BadgeProps {
  variant?: BadgeVariant
  dot?: boolean
  children: React.ReactNode
  className?: string
}

const variantClasses: Record<BadgeVariant, { pill: string; dot: string }> = {
  default: {
    pill: 'bg-zinc-800 text-zinc-400 border-zinc-700',
    dot: 'bg-zinc-400',
  },
  success: {
    pill: 'bg-green-950/60 text-green-400 border-green-900/60',
    dot: 'bg-green-400',
  },
  warning: {
    pill: 'bg-amber-950/60 text-amber-400 border-amber-900/60',
    dot: 'bg-amber-400',
  },
  error: {
    pill: 'bg-red-950/60 text-red-400 border-red-900/60',
    dot: 'bg-red-400',
  },
  info: {
    pill: 'bg-blue-950/60 text-blue-400 border-blue-900/60',
    dot: 'bg-blue-400',
  },
}

const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  dot = false,
  children,
  className = '',
}) => {
  const { pill, dot: dotColor } = variantClasses[variant]

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border',
        pill,
        className,
      ].join(' ')}
      style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
    >
      {dot && (
        <span
          className={['shrink-0 rounded-full', dotColor].join(' ')}
          style={{ width: 5, height: 5 }}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  )
}

export default Badge
