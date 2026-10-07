import type { ReactNode } from 'react'
import type { TaskState } from '../state/useAssistantTask'
import type { AssistantResult } from '../types'
import { ResultView } from './ResultView'

/** État d'un calcul asynchrone : en cours, erreur ou résultat. */
export function TaskResult<T>({
  task,
  toResult,
  before,
}: {
  task: TaskState<T>
  toResult: (value: T) => AssistantResult
  /** Contenu à placer au-dessus du résultat (ex. statut des périodes). */
  before?: (value: T) => ReactNode
}) {
  if (task.status === 'idle') return null
  if (task.status === 'running') {
    return (
      <p className="text-ink-300 text-sm" role="status" aria-live="polite">
        Calcul en cours… (l’application reste utilisable)
      </p>
    )
  }
  if (task.status === 'error') {
    return (
      <p className="text-status-danger text-sm" role="alert">
        Le calcul a échoué : {task.message}
      </p>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {before?.(task.value)}
      <ResultView result={toResult(task.value)} />
    </div>
  )
}

export function ToolIntro({ children }: { children: ReactNode }) {
  return <p className="text-ink-500 text-sm">{children}</p>
}
