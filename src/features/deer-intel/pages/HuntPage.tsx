import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, PageHeader } from '@/components/ui'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { useOnlineStatus } from '@/offline/useOnlineStatus'
import { cn } from '@/utils/cn'
import { HowTab } from '../components/HowTab'
import { ParamsPanel } from '../components/ParamsPanel'
import { SourcesPanel } from '../components/SourcesPanel'
import { WhenTab } from '../components/WhenTab'
import { WhereTab } from '../components/WhereTab'
import { useHuntStore } from '../state/huntStore'

type Tab = 'quand' | 'ou' | 'comment' | 'sources'
const TABS: { id: Tab; label: string }[] = [
  { id: 'quand', label: 'QUAND' },
  { id: 'ou', label: 'OÙ' },
  { id: 'comment', label: 'COMMENT' },
  { id: 'sources', label: 'Sources' },
]

/** « Où et quand chasser » : analyse d'un point GPS, créneaux expliqués, secteurs et points candidats. */
export default function HuntPage() {
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>('quand')
  const [paramsOpen, setParamsOpen] = useState(true)
  const status = useHuntStore((s) => s.status)
  const result = useHuntStore((s) => s.result)
  const error = useHuntStore((s) => s.error)
  const saved = useHuntStore((s) => s.saved)
  const run = useHuntStore((s) => s.run)
  const cancel = useHuntStore((s) => s.cancel)
  const loadSaved = useHuntStore((s) => s.loadSaved)
  const refreshSaved = useHuntStore((s) => s.refreshSaved)
  const setInputs = useHuntStore((s) => s.setInputs)
  const wpLoaded = useWaypointsStore((s) => s.loaded)
  const wpLoad = useWaypointsStore((s) => s.load)
  const online = useOnlineStatus()

  useEffect(() => {
    if (!wpLoaded) void wpLoad().catch(() => undefined)
    void refreshSaved()
  }, [wpLoaded, wpLoad, refreshSaved])

  // Point reçu de la carte (« Où et quand chasser ici ») : appliqué une seule fois.
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
      setInputs({ coordinate: { lat: la, lng: ln } })
  }, [lat, lng, setInputs])

  const busy = status === 'loading'
  const record = result?.record

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader
        title="Où et quand chasser"
        description="Créneaux, secteurs et points candidats pour un point GPS. Indice comparatif, pas une prédiction validée."
      />

      {!online && (
        <p role="status" className="text-status-warning text-sm">
          Hors ligne : l’astronomie se calcule ici ; la météo et l’occupation du sol
          reviennent des analyses enregistrées.
        </p>
      )}

      <Card className="p-3">
        <button
          type="button"
          className="text-ink-100 flex min-h-11 w-full items-center justify-between text-sm font-semibold"
          aria-expanded={paramsOpen}
          onClick={() => setParamsOpen((o) => !o)}
        >
          Paramètres
          <span className="text-ink-500 text-xs">
            {paramsOpen ? 'Masquer' : 'Afficher'}
          </span>
        </button>
        {paramsOpen && (
          <div className="mt-2">
            <ParamsPanel
              onRun={() => {
                void run()
                setParamsOpen(false)
              }}
              busy={busy}
            />
          </div>
        )}
        {busy && (
          <Button type="button" variant="ghost" className="mt-2" onClick={cancel}>
            Annuler le calcul
          </Button>
        )}
      </Card>

      {status === 'error' && error && (
        <p role="alert" className="text-status-danger text-sm">
          {error}
        </p>
      )}

      {record && result && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge>
              {result.origin === 'live'
                ? 'Calculée maintenant'
                : 'Enregistrée sur l’appareil'}
            </Badge>
            <span className="text-ink-500">{record.label}</span>
          </div>
          {result.notes.map((n) => (
            <p key={n} className="text-status-warning text-sm">
              {n}
            </p>
          ))}

          <div
            role="tablist"
            aria-label="Sections"
            className="flex gap-1.5 overflow-x-auto"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'min-h-11 shrink-0 rounded-md border px-4 text-sm font-semibold',
                  tab === t.id
                    ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                    : 'border-surface-700 text-ink-300',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div role="tabpanel">
            {tab === 'quand' && <WhenTab hunt={record.hunt} />}
            {tab === 'ou' && <WhereTab spatial={record.spatial} />}
            {tab === 'comment' && <HowTab hunt={record.hunt} spatial={record.spatial} />}
            {tab === 'sources' && <SourcesPanel record={record} />}
          </div>
        </>
      )}

      {!record && status !== 'loading' && (
        <Card className="p-3 text-sm">
          <p className="text-ink-100 font-semibold">
            Choisissez un point GPS, puis « Analyser ».
          </p>
          <p className="text-ink-300 mt-1">
            Sans journal ni observation, l’analyse donne les créneaux du jour d’après le
            soleil et la météo, puis les secteurs d’habitat autour du point. Ce qui manque
            est dit, jamais inventé.
          </p>
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
