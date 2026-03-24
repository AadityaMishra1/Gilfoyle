import React from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: React.ReactNode
  children: React.ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold border border-amber-500 hover:border-amber-400',
  secondary:
    'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 border border-zinc-700 hover:border-zinc-600',
  ghost:
    'bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 border border-transparent',
}

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2.5',
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  disabled = false,
  className = '',
  ...rest
}) => {
  const base =
    'inline-flex items-center justify-center rounded-md transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 select-none cursor-pointer disabled:opacity-40 disabled:pointer-events-none'

  return (
    <button
      disabled={disabled}
      className={[base, variantClasses[variant], sizeClasses[size], className].join(' ')}
      style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
      {...rest}
    >
      {icon && <span className="shrink-0 flex items-center">{icon}</span>}
      {children}
    </button>
  )
}

export default Button
