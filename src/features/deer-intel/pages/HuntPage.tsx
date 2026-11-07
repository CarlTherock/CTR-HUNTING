import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card } from '@/components/ui'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { useOnlineStatus } from '@/offline/useOnlineStatus'
import { Dashboard } from '../components/Dashboard'
import { ParamsPanel } from '../components/ParamsPanel'
import { useHuntStore } from '../state/huntStore'

/**
 * « Où et quand chasser » : le point touché sur la carte lance directement l'analyse et ouvre
 * le dashboard. Les paramètres (lieu, date, emprise) restent derrière un bouton discret.
 */
export default function HuntPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [paramsOpen, setParamsOpen] = useState(false)
  const status = useHuntStore((s) => s.status)
  const result = useHuntStore((s) => s.result)
  const error = useHuntStore((s) => s.error)
  const saved = useHuntStore((s) => s.saved)
  const run = useHuntStore((s) => s.run)
  const cancel = useHuntStore((s) => s.cancel)
  const loadSaved = useHuntStore((s) => s.loadSaved)
  const refreshSaved = useHuntStore((s) => s.refreshSaved)
  const startFor = useHuntStore((s) => s.startFor)
  const startPicking = useHuntStore((s) => s.startPicking)
  const wpLoaded = useWaypointsStore((s) => s.loaded)
  const wpLoad = useWaypointsStore((s) => s.load)
  const online = useOnlineStatus()

  useEffect(() => {
    if (!wpLoaded) void wpLoad().catch(() => undefined)
    void refreshSaved()
  }, [wpLoaded, wpLoad, refreshSaved])

  // Point reçu de la carte : une analyse initiale, sans formulaire. Le point est celui qui a été
  // touché (jamais remplacé par la position GPS ni le centre de la carte) ; un re-rendu ne relance rien.
  const lat = params.get('lat')
  const lng = params.get('lng')
  useEffect(() => {
    if (lat === null || lng === null) return
    const la = Number(lat)
    const ln = Number(lng)
    if (
      Number.isFinite(la) &&
      Number.isFinite(ln) &&
      Math.abs(la) <= 90 &&
      Math.abs(ln) <= 180
    )
      startFor({ lat: la, lng: ln })
  }, [lat, lng, startFor])

  const busy = status === 'loading'

  return (
    <div className="flex flex-col gap-3 pb-6">
      {!online && (
        <p role="status" className="text-status-warning text-sm">
          Hors ligne : l’astronomie se calcule ici ; la météo et l’occupation du sol
          reviennent des analyses enregistrées.
        </p>
      )}

      {paramsOpen && (
        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-ink-100 text-sm font-semibold">Paramètres</h2>
            <Button type="button" variant="ghost" onClick={() => setParamsOpen(false)}>
              Fermer
            </Button>
          </div>
          <ParamsPanel
            onRun={() => {
              void run()
              setParamsOpen(false)
            }}
            busy={busy}
          />
        </Card>
      )}

      {busy && (
        <Card className="p-3" role="status">
          <p className="text-ink-100 text-sm font-semibold">
            Analyse en cours : soleil, météo et occupation du sol…
          </p>
          <Button type="button" variant="ghost" className="mt-2" onClick={cancel}>
            Annuler le calcul
          </Button>
        </Card>
      )}

      {status === 'error' && error && (
        <p role="alert" className="text-status-danger text-sm">
          {error}
        </p>
      )}

      {result && (
        <Dashboard result={result} onOpenParams={() => setParamsOpen((o) => !o)} />
      )}

      {!result && !busy && (
        <Card className="p-4 text-sm">
          <p className="text-ink-100 text-base font-semibold">Où et quand chasser</p>
          <p className="text-ink-300 mt-1">
            Choisissez un point sur la carte : le meilleur créneau, le graphique de la
            journée et les secteurs d’habitat s’affichent directement. Sans journal ni
            observation ; ce qui manque est dit, jamais inventé.
          </p>
          <Button
            type="button"
            className="mt-3 w-full"
            onClick={() => {
              startPicking()
              navigate('/map')
            }}
          >
            Choisir un point sur la carte
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="mt-1 w-full"
            onClick={() => setParamsOpen(true)}
          >
            Saisir des coordonnées
          </Button>
        </Card>
      )}

      {saved.length > 0 && (
        <section aria-label="Analyses enregistrées">
          <h2 className="text-ink-100 mb-2 text-sm font-semibold">
            Analyses enregistrées (hors ligne)
          </h2>
          <ul className="flex flex-col gap-1.5">
            {saved.slice(0, 8).map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => void loadSaved(s.id)}
                  className="border-surface-700 bg-surface-900 text-ink-300 min-h-11 w-full rounded-md border px-3 text-left text-sm"
                >
                  {s.label}{' '}
                  <span className="text-ink-600">
                    · enregistrée {s.savedAt.slice(0, 16).replace('T', ' ')} UTC
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
