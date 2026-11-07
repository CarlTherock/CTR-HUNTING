import { useState } from 'react'
import { Button } from '@/components/ui'
import { checkServices, type ServiceCheckResult } from '../serviceCheck'

/** Bouton « Vérifier les services » : dit ce que cet appareil obtient, sans rien supposer. */
export function ServiceCheck() {
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle')
  const [results, setResults] = useState<ServiceCheckResult[]>([])

  const run = async () => {
    setState('running')
    setResults(await checkServices())
    setState('done')
  }

  return (
    <div className="mt-2" data-testid="service-check">
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={state === 'running'}
        onClick={() => void run()}
      >
        {state === 'running' ? 'Vérification…' : 'Vérifier les services'}
      </Button>
      {state === 'done' && (
        <ul className="text-ink-300 mt-2 flex flex-col gap-1 text-xs" role="status">
          {results.map((r) => (
            <li key={`${r.service}-${r.host}`}>
              <strong className={r.ok ? 'text-accent-400' : 'text-amber-400'}>
                {r.ok ? 'Joignable' : 'Non joignable'}
              </strong>{' '}
              — {r.service} ({r.host}) : {r.detail}, {r.ms} ms
            </li>
          ))}
          {results.every((r) => !r.ok) && (
            <li className="text-ink-400">
              Aucun service ne répond depuis cet appareil : réseau coupé, mode avion ou
              accès bloqué. Ce n’est pas une absence de cartographie.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
