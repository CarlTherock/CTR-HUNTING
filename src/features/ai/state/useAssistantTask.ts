import { useEffect, useState } from 'react'
import { isAbortError } from '../chunking'

export type TaskState<T> =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; value: T }
  | { status: 'error'; message: string }

type RunFn<T> = (signal: AbortSignal) => Promise<T>

const IDLE = { status: 'idle' } as const
const RUNNING = { status: 'running' } as const

/**
 * Exécute un calcul asynchrone annulable. Quand `run` change (nouveaux
 * critères, nouvelles données) ou que le composant disparaît, le calcul en
 * cours est ANNULÉ (`AbortSignal`) et son résultat n'est jamais affiché :
 * un résultat périmé ne remplace pas le plus récent, et pendant qu'un
 * nouveau calcul tourne l'ancien résultat n'est pas présenté comme actuel.
 * `run === null` = au repos.
 *
 * `run` doit être mémoïsé par l'appelant (`useMemo`) : c'est sa clé.
 */
export function useAssistantTask<T>(run: RunFn<T> | null): TaskState<T> {
  // Le résultat est associé au `run` qui l'a produit.
  const [settled, setSettled] = useState<{ run: RunFn<T>; state: TaskState<T> } | null>(
    null,
  )

  useEffect(() => {
    if (!run) return
    const controller = new AbortController()
    run(controller.signal).then(
      (value) => {
        if (!controller.signal.aborted)
          setSettled({ run, state: { status: 'done', value } })
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return
        setSettled({
          run,
          state: {
            status: 'error',
            message: error instanceof Error ? error.message : 'erreur inconnue',
          },
        })
      },
    )
    return () => controller.abort()
  }, [run])

  if (!run) return IDLE
  if (settled && settled.run === run) return settled.state
  return RUNNING
}
