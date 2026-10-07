import { useMemo, useState } from 'react'
import { Badge, Button } from '@/components/ui'
import { ALL_TERRITORIES } from '@/features/territories/filter'
import type { TerritoryFilter } from '@/features/territories/filter'
import { MIN_ITEMS_PER_PERIOD, comparePeriodsAsync } from '../periods'
import type { PeriodInput, PeriodsOutput } from '../periods'
import { useAssistantRecords } from '../state/useAssistantRecords'
import { useAssistantTask } from '../state/useAssistantTask'
import { CONTROL, Field, TerritoryScopeSelect } from './fields'
import { TaskResult, ToolIntro } from './TaskResult'

const pad = (n: number) => String(n).padStart(2, '0')
function localDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return localDay(d)
}

interface Committed {
  a: PeriodInput
  b: PeriodInput
  scope: TerritoryFilter
}

function PeriodFields({
  name,
  value,
  onChange,
}: {
  name: 'A' | 'B'
  value: PeriodInput
  onChange: (next: PeriodInput) => void
}) {
  return (
    <fieldset className="border-surface-700 flex min-w-0 flex-col gap-2 rounded-md border p-3">
      <legend className="text-ink-100 px-1 text-sm font-semibold">Période {name}</legend>
      <Field label="Nom (facultatif)">
        {(id) => (
          <input
            id={id}
            className={CONTROL}
            maxLength={40}
            value={value.label}
            onChange={(e) => onChange({ ...value, label: e.target.value })}
          />
        )}
      </Field>
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        <Field label="Du">
          {(id) => (
            <input
              id={id}
              type="date"
              className={CONTROL}
              value={value.from}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
            />
          )}
        </Field>
        <Field label="Au (inclus)">
          {(id) => (
            <input
              id={id}
              type="date"
              className={CONTROL}
              value={value.to}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
            />
          )}
        </Field>
      </div>
    </fieldset>
  )
}

/** « Comparer des périodes » : refuse de conclure avec trop peu de données. */
export function ToolPeriods() {
  const { records, ready } = useAssistantRecords()
  const [a, setA] = useState<PeriodInput>(() => ({
    label: '30 jours précédents',
    from: daysAgo(59),
    to: daysAgo(30),
  }))
  const [b, setB] = useState<PeriodInput>(() => ({
    label: '30 derniers jours',
    from: daysAgo(29),
    to: daysAgo(0),
  }))
  const [scope, setScope] = useState<TerritoryFilter>(ALL_TERRITORIES)
  const [committed, setCommitted] = useState<Committed | null>(null)

  const run = useMemo(
    () =>
      ready && committed
        ? (signal: AbortSignal) =>
            comparePeriodsAsync({ ...committed, records }, { signal })
        : null,
    [ready, committed, records],
  )
  const task = useAssistantTask(run)

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ToolIntro>
        Compare deux périodes que vous choisissez : quantités enregistrées, distances et
        conditions moyennes déjà enregistrées. Sous {MIN_ITEMS_PER_PERIOD} éléments par
        période, l’outil refuse de conclure et le dit. Il ne produit jamais de tendance.
      </ToolIntro>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <PeriodFields name="A" value={a} onChange={setA} />
        <PeriodFields name="B" value={b} onChange={setB} />
      </div>
      <TerritoryScopeSelect value={scope} onChange={setScope} />
      <Button
        className="h-11 w-full sm:w-auto"
        disabled={!ready}
        onClick={() =>
          setCommitted({
            a: { ...a, label: a.label.trim() || 'Période A' },
            b: { ...b, label: b.label.trim() || 'Période B' },
            scope,
          })
        }
      >
        Comparer les deux périodes
      </Button>
      <TaskResult<PeriodsOutput>
        task={task}
        toResult={(output) => output.result}
        before={(output) => (
          <div>
            {output.status === 'insufficient' && (
              <Badge variant="warning" data-testid="periods-status">
                Données insuffisantes : aucune comparaison
              </Badge>
            )}
            {output.status === 'sufficient' && (
              <Badge variant="success" data-testid="periods-status">
                Données suffisantes : écarts calculés
              </Badge>
            )}
            {output.status === 'invalid' && (
              <Badge variant="danger" data-testid="periods-status">
                Périodes invalides
              </Badge>
            )}
          </div>
        )}
      />
    </div>
  )
}
