import { useId } from 'react'
import type { ReactNode } from 'react'
import {
  UNCLASSIFIED_LABEL,
  filterFromValue,
  filterToValue,
  sortTerritories,
} from '@/features/territories/filter'
import type { TerritoryFilter } from '@/features/territories/filter'
import { useTerritoriesStore } from '@/features/territories/state/territoriesStore'
import { useEnsureTerritories } from '@/features/territories/useEnsureTerritories'
import { cn } from '@/utils/cn'

export const CONTROL =
  'border-surface-600 bg-surface-800 text-ink-100 focus-visible:outline-brand-400 min-h-11 w-full min-w-0 rounded-md border px-3 text-base outline-none focus-visible:outline-2'

/** Champ avec libellé visible, relié à son contrôle. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: (id: string) => ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="text-ink-500 text-xs font-medium">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-ink-500 text-[11px]">{hint}</p>}
    </div>
  )
}

/** Choix d'un territoire (tous / chaque territoire / non classé / archivés),
 * indépendant du filtre des listes. */
export function TerritoryScopeSelect({
  value,
  onChange,
  label = 'Territoire',
}: {
  value: TerritoryFilter
  onChange: (scope: TerritoryFilter) => void
  label?: string
}) {
  useEnsureTerritories()
  const territories = useTerritoriesStore((s) => s.territories)
  const active = sortTerritories(territories.filter((t) => !t.archivedAt))
  const hasArchived = territories.some((t) => t.archivedAt)
  return (
    <Field label={label}>
      {(id) => (
        <select
          id={id}
          className={CONTROL}
          value={filterToValue(value)}
          onChange={(event) => onChange(filterFromValue(event.target.value))}
        >
          <option value="all">Tous les territoires</option>
          {active.map((territory) => (
            <option key={territory.id} value={`territory:${territory.id}`}>
              {territory.name}
            </option>
          ))}
          <option value="unclassified">{UNCLASSIFIED_LABEL}</option>
          {(hasArchived || value.kind === 'archived') && (
            <option value="archived">Territoires archivés</option>
          )}
        </select>
      )}
    </Field>
  )
}

/** Case à cocher de 44 px minimum. */
export function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
      <input
        type="checkbox"
        className="accent-brand-500 size-5 shrink-0"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="text-ink-100 min-w-0 break-words">{label}</span>
    </label>
  )
}
