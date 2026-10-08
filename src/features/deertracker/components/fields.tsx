import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

export const INPUT_CLASS =
  'border-surface-600 bg-surface-800 text-ink-100 focus-visible:outline-brand-400 min-h-11 w-full min-w-0 rounded-md border px-3 text-base outline-none focus-visible:outline-2'

/** Label above a control (visible label, not a placeholder). */
export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={htmlFor} className="text-ink-300 text-xs font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-ink-500 text-xs">{hint}</p>}
    </div>
  )
}

/** One-of-N chips, 44 px tall, never colour-only (the label is the content). */
export function ChoiceChips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T | undefined
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'focus-visible:outline-brand-400 min-h-11 rounded-lg border px-3 text-sm font-medium focus-visible:outline-2',
              selected
                ? 'border-brand-400 bg-brand-500/20 text-brand-400'
                : 'border-surface-600 bg-surface-800 text-ink-100 hover:bg-surface-700',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
