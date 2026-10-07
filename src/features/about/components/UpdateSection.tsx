import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import {
  checkForServiceWorkerUpdate,
  readServiceWorkerInfo,
  type ServiceWorkerInfo,
  type UpdateCheckResult,
} from '../swUpdate'

const RESULT_TEXT: Record<UpdateCheckResult, string> = {
  unsupported:
    'Ce navigateur ne gère pas les service workers : pas de mise à jour automatique.',
  'not-registered':
    'Aucun service worker n’est actif (normal en développement, ou avant la fin de la première visite).',
  'up-to-date': 'Aucune nouvelle version détectée.',
  'update-found':
    'Une nouvelle version a été trouvée et s’active. Rechargez pour utiliser son code.',
  error:
    'La recherche a échoué (hors ligne, ou serveur injoignable). Rien n’a été modifié.',
}

/** Service-worker status, how updates apply, and a manual check. */
export function UpdateSection() {
  const [info, setInfo] = useState<ServiceWorkerInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<UpdateCheckResult | null>(null)

  useEffect(() => {
    let cancelled = false
    void readServiceWorkerInfo().then((value) => {
      if (!cancelled) setInfo(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function check() {
    setChecking(true)
    setResult(null)
    const outcome = await checkForServiceWorkerUpdate()
    setResult(outcome)
    setInfo(await readServiceWorkerInfo())
    setChecking(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-2">
        Service worker :{' '}
        {info === null ? (
          <Badge>Vérification…</Badge>
        ) : info.registered ? (
          <Badge variant="success">
            actif{info.state ? ` (${info.state})` : ''}
            {info.controlled ? ', contrôle cette page' : ''}
          </Badge>
        ) : (
          <Badge variant="neutral">non actif</Badge>
        )}
        {info?.updatePending && <Badge variant="warning">mise à jour en cours</Badge>}
      </p>
      <p>
        <strong className="text-ink-100">Comment la mise à jour s’applique.</strong>{' '}
        L’application se met à jour automatiquement : le navigateur cherche une nouvelle
        version à l’ouverture et régulièrement ; quand il en trouve une, il la télécharge
        et l’active sans rien demander. En revanche, la page déjà ouverte garde l’ancien
        code jusqu’à ce que vous la rechargiez ou rouvriez l’application. Les données
        (points, traces, journal) ne sont pas touchées par une mise à jour.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={checking}
          onClick={() => void check()}
        >
          <RefreshCw size={14} aria-hidden="true" />
          Rechercher une mise à jour
        </Button>
        {result === 'update-found' && (
          <Button size="sm" onClick={() => window.location.reload()}>
            Recharger maintenant
          </Button>
        )}
      </div>
      {checking && (
        <p role="status" className="text-ink-500 text-xs">
          Recherche en cours…
        </p>
      )}
      {result && (
        <p role="status" className="text-ink-300">
          {RESULT_TEXT[result]}
        </p>
      )}
    </div>
  )
}
