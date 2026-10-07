import { useId } from 'react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui'
import { cn } from '@/utils/cn'

/** Same look as a secondary `Button`, for links that navigate. */
export const LINK_BUTTON_CLASS =
  'bg-surface-700 text-ink-100 hover:bg-surface-600 border-surface-500 inline-flex h-10 pointer-coarse:h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors'

/** Compact card of the home page: icon + title, then free content. */
export function DashboardCard({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: LucideIcon
  title: string
  children: ReactNode
  className?: string
}) {
  const titleId = useId()
  return (
    <Card className={cn('min-w-0', className)}>
      <section aria-labelledby={titleId} className="flex h-full flex-col gap-3 p-4">
        <h2
          id={titleId}
          className="text-ink-100 flex items-center gap-2 text-sm font-semibold"
        >
          <Icon size={16} className="text-brand-400 shrink-0" aria-hidden="true" />
          {title}
        </h2>
        {children}
      </section>
    </Card>
  )
}

/** Muted one-line explanation under a card's main content. */
export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-ink-500 text-xs">{children}</p>
}
