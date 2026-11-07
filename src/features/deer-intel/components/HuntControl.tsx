import { useEffect, useState } from 'react'
import { useInRouterContext, useNavigate } from 'react-router-dom'
import { Compass, X } from 'lucide-react'
import { ToolTrigger } from '@/components/map-tools'
import { useSharedPointStore } from '@/features/share/sharedPointStore'
import { zonedDateKey } from '@/features/hunting-hours/zonedTime'
import { resolveTimeZone, classifyTerritory } from '@/features/rut/territory'
import { deviceTimeZone } from '../state/compose'
import { useHuntStore } from '../state/huntStore'

export const HUNT_ROUTE = '/hunt'

/** Navigue vers le dashboard quand un point a été touché sur la carte. */
function PickedNavigator() {
  const navigate = useNavigate()
  const picked = useHuntStore((s) => s.picked)
  const consume = useHuntStore((s) => s.consumePicked)
  useEffect(() => {
    if (!picked) return
    navigate(`${HUNT_ROUTE}?lat=${picked.lat.toFixed(5)}&lng=${picked.lng.toFixed(5)}`)
    consume()
  }, [picked, navigate, consume])
  return null
}

const PERIODS = [
  { days: 1, label: '1 jour' },
  { days: 3, label: '3 jours' },
  { days: 7, label: '7 jours' },
] as const

/** Fiche après le toucher : date préremplie (modifiable), période, puis « Évaluer ce lieu ». */
function EvaluateSheet() {
  const pending = useHuntStore((s) => s.pending)
  const evaluate = useHuntStore((s) => s.evaluatePending)
  const cancel = useHuntStore((s) => s.cancelPending)
  const startPicking = useHuntStore((s) => s.startPicking)
  const [date, setDate] = useState<string | null>(null)
  const [days, setDays] = useState<number>(1)
  if (!pending) return null
  const zone = resolveTimeZone(pending.lat, pending.lng)
  // Préremplissage seulement : « aujourd'hui » au lieu si son fuseau est connu, sinon à l'appareil.
  const prefilled = zonedDateKey(new Date(), zone.timeZone ?? deviceTimeZone())
  const value = date ?? prefilled
  const territory = classifyTerritory(pending.lat, pending.lng)
  return (
    <div
      data-testid="hunt-evaluate-sheet"
      role="dialog"
      aria-label="Évaluer ce lieu"
      className="border-brand-500/40 bg-surface-900 text-ink-100 fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md flex-col gap-3 rounded-t-xl border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg"
    >
      <p className="text-sm font-semibold">
        Lieu choisi : {pending.lat.toFixed(5)}, {pending.lng.toFixed(5)}
      </p>
      {territory.state === 'hors_territoire' && (
        <p className="text-status-warning text-xs">
          Hors du territoire documenté : les repères saisonniers du Québec ne seront pas
          appliqués.
        </p>
      )}
      <label className="flex flex-col gap-1 text-sm">
        Date de début
        <input
          type="date"
          value={value}
          onChange={(e) => setDate(e.target.value || null)}
          className="border-surface-600 bg-surface-800 min-h-11 rounded-md border px-3"
        />
      </label>
      <div role="group" aria-label="Période" className="flex gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.days}
            type="button"
            aria-pressed={days === p.days}
            onClick={() => setDays(p.days)}
            className={`min-h-11 flex-1 rounded-md border px-3 text-sm ${days === p.days ? 'border-brand-500 bg-brand-500/20' : 'border-surface-600'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => evaluate({ startDateKey: value, days })}
        className="bg-brand-500 text-surface-900 min-h-11 rounded-md px-4 font-semibold"
      >
        Évaluer ce lieu
      </button>
      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={startPicking}
          className="min-h-11 flex-1 underline"
        >
          Changer le point
        </button>
        <button type="button" onClick={cancel} className="min-h-11 flex-1 underline">
          Annuler
        </button>
      </div>
    </div>
  )
}

/**
 * Entrée principale de « Où et quand chasser » sur la carte : un bouton, puis un toucher sur
 * la carte (ou le point partagé affiché), puis le dashboard directement. Le point utilisé est
 * celui qui est touché : il n'est jamais remplacé par la position GPS ni par le centre de la carte.
 */
export function HuntControl() {
  const inRouter = useInRouterContext()
  const picking = useHuntStore((s) => s.picking)
  const start = useHuntStore((s) => s.startPicking)
  const cancel = useHuntStore((s) => s.cancelPicking)
  const pick = useHuntStore((s) => s.pick)
  const shared = useSharedPointStore((s) => s.point)

  return (
    <>
      {inRouter && <PickedNavigator />}
      <EvaluateSheet />
      <ToolTrigger
        label="Où et quand chasser"
        icon={<Compass size={18} aria-hidden="true" />}
        onClick={start}
        order={-5}
      />
      {picking && (
        <div
          role="status"
          className="border-brand-500/40 bg-surface-900/95 text-ink-100 absolute top-3 left-1/2 z-20 flex max-w-[92vw] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg"
        >
          <span>Touchez la carte pour choisir le point à analyser</span>
          {shared && (
            <button
              type="button"
              onClick={() => pick(shared.coordinate)}
              className="border-brand-500/50 text-brand-300 min-h-11 rounded-md border px-3"
            >
              Utiliser le point partagé
            </button>
          )}
          <button
            type="button"
            onClick={cancel}
            aria-label="Annuler le choix du point"
            className="text-ink-500 hover:text-ink-100 flex size-11 items-center justify-center"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  )
}
