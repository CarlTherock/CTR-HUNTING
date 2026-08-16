import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

/** Used for "not built yet" feature placeholders as well as genuine empty
 * lists (no waypoints yet, etc.) once features exist. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-card border-surface-600 flex flex-col items-center justify-center gap-3 border border-dashed px-6 py-16 text-center',
        className,
      )}
    >
      {icon && <div className="text-ink-500">{icon}</div>}
      <div className="space-y-1">
        <h2 className="text-ink-100 text-base font-semibold">{title}</h2>
        {description && (
          <p className="text-ink-500 mx-auto max-w-sm text-sm">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}
