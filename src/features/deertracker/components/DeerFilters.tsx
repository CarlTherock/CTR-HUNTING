import { useId } from 'react'
import { TerritoryFilterBar } from '@/features/territories/components/TerritoryFilterBar'
import type { DeerEntryKind } from '@/types'
import { DEER_KINDS, DEER_KIND_LABEL } from '../deerLogic'
import { cn } from '@/utils/cn'
import { Field, INPUT_CLASS } from './fields'
import type { DeerFilterState } from '../deerFilters'

/** Territory (shared filter bar), type and date filters. */
export function DeerFilters({
  value,
  onChange,
}: {
  value: DeerFilterState
  onChange: (next: DeerFilterState) => void
}) {
  const fromId = useId()
  const toId = useId()
  function toggle(kind: DeerEntryKind) {
    onChange({
      ...value,
      kinds: value.kinds.includes(kind)
        ? value.kinds.filter((k) => k !== kind)
        : [...value.kinds, kind],
    })
  }
  return (
    <div className="flex flex-col gap-3" role="group" aria-label="Filtres">
      <TerritoryFilterBar />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Types affichés">
        {DEER_KINDS.map((kind) => {
          const on = value.kinds.includes(kind)
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(kind)}
              className={cn(
                'focus-visible:outline-brand-400 min-h-11 rounded-lg border px-3 text-sm font-medium focus-visible:outline-2',
                on
                  ? 'border-brand-400 bg-brand-500/20 text-brand-400'
                  : 'border-surface-600 bg-surface-800 text-ink-100',
              )}
            >
              {DEER_KIND_LABEL[kind]}
            </button>
          )
        })}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Du" htmlFor={fromId}>
          <input
            id={fromId}
            type="date"
            value={value.from}
            max={value.to || undefined}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Au" htmlFor={toId}>
          <input
            id={toId}
            type="date"
            value={value.to}
            min={value.from || undefined}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className={INPUT_CLASS}
          />
        </Field>
      </div>
    </div>
  )
}
