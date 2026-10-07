import { useMemo } from 'react'
import { summarizeTerritoryAsync } from '../territorySummary'
import { useAssistantRecords } from '../state/useAssistantRecords'
import { useAssistantStore } from '../state/assistantStore'
import { useAssistantTask } from '../state/useAssistantTask'
import { TerritoryScopeSelect } from './fields'
import { TaskResult, ToolIntro } from './TaskResult'

/** « Résumer les observations d'un territoire ». */
export function ToolTerritory() {
  const { records, ready } = useAssistantRecords()
  const scope = useAssistantStore((s) => s.summaryScope)
  const setScope = useAssistantStore((s) => s.setSummaryScope)

  const run = useMemo(
    () =>
      ready
        ? (signal: AbortSignal) => summarizeTerritoryAsync({ scope, records }, { signal })
        : null,
    [ready, scope, records],
  )
  const task = useAssistantTask(run)

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ToolIntro>
        Comptes par type, traces (distance et durée), journal, photos, période couverte et
        derniers éléments d’un territoire. Tout est compté dans vos enregistrements ; le
        texte des notes n’est jamais interprété.
      </ToolIntro>
      <TerritoryScopeSelect
        value={scope}
        onChange={setScope}
        label="Territoire à résumer"
      />
      {!ready && (
        <p className="text-ink-300 text-sm" role="status">
          Lecture des enregistrements de l’appareil…
        </p>
      )}
      <TaskResult task={task} toResult={(result) => result} />
    </div>
  )
}
