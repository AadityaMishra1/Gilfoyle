import React from 'react'

export interface TooltipProps {
  content: string
  position?: 'top' | 'bottom' | 'left' | 'right'
  children: React.ReactNode
  className?: string
}

/**
 * CSS-only tooltip wrapper. No external library required.
 * Uses a sibling element revealed on group-hover via Tailwind's group utility.
 */
const Tooltip: React.FC<TooltipProps> = ({
  content,
  position = 'top',
  children,
  className = '',
}) => {
  const positionClasses: Record<NonNullable<TooltipProps['position']>, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  const arrowClasses: Record<NonNullable<TooltipProps['position']>, string> = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-zinc-700 border-x-transparent border-b-transparent border-[5px]',
    bottom:
      'bottom-full left-1/2 -translate-x-1/2 border-b-zinc-700 border-x-transparent border-t-transparent border-[5px]',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-zinc-700 border-y-transparent border-r-transparent border-[5px]',
    right:
      'right-full top-1/2 -translate-y-1/2 border-r-zinc-700 border-y-transparent border-l-transparent border-[5px]',
  }

  return (
    <div className={['relative inline-flex group', className].join(' ')}>
      {children}

      {/* Tooltip bubble */}
      <div
        role="tooltip"
        className={[
          'pointer-events-none absolute z-50 w-max max-w-[200px]',
          'rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5',
          'text-xs text-zinc-200 shadow-lg whitespace-nowrap',
          'opacity-0 group-hover:opacity-100',
          'translate-y-0.5 group-hover:translate-y-0',
          'transition-all duration-150',
          positionClasses[position],
        ].join(' ')}
        style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
      >
        {content}
        {/* Arrow */}
        <span
          aria-hidden="true"
          className={['absolute border', arrowClasses[position]].join(' ')}
        />
      </div>
    </div>
  )
}

export default Tooltip
