import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { parseSharedPoint } from '../sharedPoint'
import { useSharedPointStore } from '../sharedPointStore'

const NOTICE_DURATION_MS = 10_000

/**
 * Startup handler for CTR Hunting point links (`?p=<lat>,<lng>&n=<name>` on
 * the app root). A valid link puts the point in memory as a PREVIEW, moves
 * to the map and removes the query from the address bar; an invalid one
 * shows a short notice and is ignored. It never writes anything: saving the
 * point is a separate, explicit action on the preview card.
 */
export function SharedPointHandler() {
  const location = useLocation()
  const navigate = useNavigate()
  const notice = useSharedPointStore((state) => state.notice)
  const dismissNotice = useSharedPointStore((state) => state.dismissNotice)

  useEffect(() => {
    const parsed = parseSharedPoint(location.search)
    if (parsed.kind === 'none') return
    if (parsed.kind === 'valid') {
      useSharedPointStore.getState().show(parsed.point)
      navigate('/map', { replace: true })
    } else {
      useSharedPointStore.getState().reportInvalid()
      navigate(location.pathname, { replace: true })
    }
  }, [location.search, location.pathname, navigate])

  useEffect(() => {
    if (!notice) return
    const id = setTimeout(dismissNotice, NOTICE_DURATION_MS)
    return () => clearTimeout(id)
  }, [notice, dismissNotice])

  if (!notice) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-[calc(0.5rem+env(safe-area-inset-top))]">
      <p
        role="status"
        className="border-status-warning/60 bg-surface-900 text-ink-100 pointer-events-auto flex max-w-sm items-center gap-2 rounded-md border py-1 pr-1 pl-3 text-sm shadow-lg"
      >
        <span>{notice}</span>
        <button
          type="button"
          onClick={dismissNotice}
          aria-label="Fermer l’avis"
          className="text-ink-500 hover:text-ink-100 flex size-11 shrink-0 items-center justify-center"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </p>
    </div>
  )
}
