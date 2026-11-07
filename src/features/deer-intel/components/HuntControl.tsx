import { useEffect } from 'react'
import { useInRouterContext, useNavigate } from 'react-router-dom'
import { Compass, X } from 'lucide-react'
import { ToolTrigger } from '@/components/map-tools'
import { useSharedPointStore } from '@/features/share/sharedPointStore'
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
