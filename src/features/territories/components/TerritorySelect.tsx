import { useId } from 'react'
import { cn } from '@/utils/cn'
import { UNCLASSIFIED_LABEL, sortTerritories } from '../filter'
import { useTerritoriesStore } from '../state/territoriesStore'
import { useEnsureTerritories } from '../useEnsureTerritories'

export interface TerritorySelectProps {
  /** Current `territoryId`; `undefined` is « Non classé ». */
  value: string | undefined
  onChange: (territoryId: string | undefined) => void
  label?: string
  /** Hides the visible label (an `aria-label` is used instead). */
  compact?: boolean
  disabled?: boolean
  className?: string
}

const SELECT =
  'border-surface-600 bg-surface-800 text-ink-100 focus-visible:outline-brand-400 min-h-11 w-full min-w-0 rounded-md border px-3 text-base outline-none focus-visible:outline-2'

/** Picks the territory an item is filed in. Archived territories are not
 * offered — except the one the item is currently in, so opening an item
 * never silently changes its folder. Only the folder changes, never the
 * item's position. */
export function TerritorySelect({
  value,
  onChange,
  label = 'Territoire',
  compact = false,
  disabled,
  className,
}: TerritorySelectProps) {
  useEnsureTerritories()
  const territories = useTerritoriesStore((state) => state.territories)
  const id = useId()

  const known = territories.find((t) => t.id === value)
  const options = sortTerritories(territories).filter((t) => !t.archivedAt || t === known)
  const shown = known ? known.id : ''

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {compact ? null : (
        <label htmlFor={id} className="text-ink-500 text-xs font-medium">
          {label}
        </label>
      )}
      <select
        id={id}
        aria-label={compact ? label : undefined}
        value={shown}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value || undefined)}
        className={SELECT}
      >
        <option value="">{UNCLASSIFIED_LABEL}</option>
        {options.map((territory) => (
          <option key={territory.id} value={territory.id}>
            {territory.name}
            {territory.archivedAt ? ' (archivé)' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
