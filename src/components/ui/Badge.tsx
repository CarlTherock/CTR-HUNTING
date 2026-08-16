import type { HTMLAttributes } from 'react'
import { cn } from '@/utils/cn'

export type BadgeVariant = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger'

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'bg-surface-700 text-ink-300',
  brand: 'bg-brand-500/15 text-brand-400',
  info: 'bg-status-info/15 text-status-info',
  success: 'bg-status-success/15 text-status-success',
  warning: 'bg-status-warning/15 text-status-warning',
  danger: 'bg-status-danger/15 text-status-danger',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

export function Badge({ className, variant = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  )
}
