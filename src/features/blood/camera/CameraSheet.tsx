import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'

/**
 * A sheet that opens over the camera: from the bottom in portrait, from the
 * right edge in short landscape. The camera image stays visible and running
 * behind it (no dimming backdrop), and its header with the close button never
 * scrolls away: only the body scrolls. Insets are applied once, here.
 */
export function CameraSheet({
  label,
  title,
  onClose,
  children,
  footer,
  testId,
}: {
  label: string
  title: string
  onClose: () => void
  children: ReactNode
  /** Stays visible under the scrolling body (the primary action). */
  footer?: ReactNode
  testId?: string
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={label}
      data-testid={testId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
      className={cn(
        'bg-surface-900/95 text-ink-100 border-surface-600 absolute z-30 flex min-h-0 flex-col border shadow-2xl backdrop-blur-sm',
        // Portrait: bottom sheet, never taller than the screen can spare.
        'inset-x-0 bottom-0 max-h-[min(72dvh,34rem)] rounded-t-2xl border-b-0',
        // Short landscape: side sheet, full height, image stays on the left.
        '[@media(max-height:480px)]:inset-y-0 [@media(max-height:480px)]:right-0 [@media(max-height:480px)]:bottom-0 [@media(max-height:480px)]:left-auto [@media(max-height:480px)]:max-h-none [@media(max-height:480px)]:w-[min(24rem,58%)] [@media(max-height:480px)]:rounded-l-2xl [@media(max-height:480px)]:rounded-tr-none [@media(max-height:480px)]:border-r-0 [@media(max-height:480px)]:border-b',
      )}
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={`Fermer : ${title}`}
          className="flex h-11 w-11 items-center justify-center rounded-full"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto [overscroll-behavior:contain] px-3 pb-3">
        {children}
      </div>
      {footer && <div className="shrink-0 px-3 pt-2 pb-3">{footer}</div>}
    </div>
  )
}
