import { Wind, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { compassLabel } from '@/utils/terrain'
import { useWindStore } from '../state/windStore'
import type { Coordinate } from '@/types'
import type { LngLatBounds } from '@/utils/tiles'

export interface WindLayerControlProps {
  getBounds: () => LngLatBounds | null
  /** Used only for the compact readout label (nearest real sample to
   * this point) — the animated flow field itself covers the whole
   * fetched grid, not just this one point. */
  referenceCoordinate: Coordinate
}

function formatHourLabel(offset: number): string {
  if (offset === 0) return 'Now'
  return `+${offset}h`
}

/** Floating toggle for the animated wind flow field (Phase 6) + an
 * interactive 24h timeline scrubber, shown only while the layer is on.
 * The map animation itself is entirely owned by `MapLibreProvider`
 * (`MapInstance.setWindField`) — this component only decides *when* to
 * fetch/toggle/scrub, never touches the map engine directly. */
export function WindLayerControl({ getBounds, referenceCoordinate }: WindLayerControlProps) {
  const enabled = useWindStore((state) => state.enabled)
  const status = useWindStore((state) => state.status)
  const errorReason = useWindStore((state) => state.errorReason)
  const selectedHourOffset = useWindStore((state) => state.selectedHourOffset)
  const setSelectedHourOffset = useWindStore((state) => state.setSelectedHourOffset)
  const toggle = useWindStore((state) => state.toggle)
  const fetch = useWindStore((state) => state.fetch)
  const windAt = useWindStore((state) => state.windAt)

  function handleToggle() {
    const bounds = getBounds()
    if (bounds) toggle(bounds)
  }

  function refresh() {
    const bounds = getBounds()
    if (bounds) void fetch(bounds)
  }

  const reading = windAt(referenceCoordinate)

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
        aria-pressed={enabled}
        title="Wind flow field"
        aria-label="Toggle wind flow field"
        className={cn(
          'border-surface-600 bg-surface-900/90 hover:bg-surface-800 absolute top-[33rem] right-3 z-10 rounded-lg border p-2.5 shadow-lg backdrop-blur-sm transition-colors',
          enabled ? 'bg-brand-500/15 text-brand-400' : 'text-ink-300',
        )}
      >
        <Wind size={18} aria-hidden="true" />
      </button>

      {enabled && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="border-surface-600 bg-surface-900/95 w-full max-w-sm rounded-lg border p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-ink-100 text-sm font-semibold">Wind</h2>
              <button
                type="button"
                onClick={handleToggle}
                aria-label="Hide wind layer"
                className="text-ink-500 hover:text-ink-100"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {status === 'loading' && <p className="text-ink-500 text-sm">Loading wind data…</p>}
            {status === 'error' && (
              <p className="text-status-danger text-sm">
                Wind unavailable — {errorReason}.{' '}
                <button type="button" onClick={refresh} className="underline">
                  Retry
                </button>
              </p>
            )}

            {reading && (
              <>
                <div className="mb-2 flex items-center gap-3">
                  <Wind
                    size={22}
                    className="text-brand-400 shrink-0"
                    style={{ transform: `rotate(${reading.directionDegrees}deg)` }}
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-ink-100 text-sm font-medium">
                      {Math.round(reading.speedKmh)} km/h from {compassLabel(reading.directionDegrees)}
                    </p>
                    <p className="text-ink-500 text-xs">
                      Gusts {Math.round(reading.gustsKmh)} km/h · {formatHourLabel(selectedHourOffset)}
                    </p>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={23}
                  step={1}
                  value={selectedHourOffset}
                  onChange={(e) => setSelectedHourOffset(Number(e.target.value))}
                  aria-label="Hour offset"
                  className="accent-brand-500 w-full"
                />
                <div className="text-ink-500 mt-1 flex justify-between text-[10px]">
                  <span>Now</span>
                  <span>+12h</span>
                  <span>+23h</span>
                </div>
                <button
                  type="button"
                  onClick={refresh}
                  className="text-ink-500 hover:text-ink-100 mt-2 text-xs underline"
                >
                  Refresh for this area
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
