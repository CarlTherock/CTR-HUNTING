import { Radar, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useRadarStore } from '../state/radarStore'

/** Real minutes from now to `frame.time` (a Unix-seconds timestamp from
 * RainViewer), signed — negative for real observed past frames, positive
 * for RainViewer's own short-range nowcast extrapolation. Never a made-up
 * offset: computed from the actual frame timestamp vs. the actual clock. */
function minutesFromNow(unixSeconds: number): number {
  return Math.round((unixSeconds * 1000 - Date.now()) / 60_000)
}

function formatFrameLabel(unixSeconds: number, isNowcast: boolean): string {
  const minutes = minutesFromNow(unixSeconds)
  if (Math.abs(minutes) < 2) return 'Now'
  const label = minutes > 0 ? `+${minutes} min` : `${minutes} min`
  return isNowcast ? `${label} (forecast)` : label
}

/**
 * Real precipitation radar (RainViewer, `services/radar`) — the same kind
 * of continuous radar mosaic MétéoMédia/AccuWeather/HuntStand's "Detailed
 * Weather Maps" show, layered on the map as a genuine raster tile source
 * (`MapInstance.setRadarLayer`), not a synthesized per-point overlay like
 * the Phase 6 wind/temperature layer. Independent of that layer's 48h
 * hourly timeline — RainViewer only covers roughly the last 2h of real
 * observed frames plus a ~30-60min nowcast, its own real cadence.
 */
export function RadarLayerControl() {
  const enabled = useRadarStore((state) => state.enabled)
  const status = useRadarStore((state) => state.status)
  const errorReason = useRadarStore((state) => state.errorReason)
  const frames = useRadarStore((state) => state.frames)
  const selectedFrameIndex = useRadarStore((state) => state.selectedFrameIndex)
  const setSelectedFrameIndex = useRadarStore((state) => state.setSelectedFrameIndex)
  const toggle = useRadarStore((state) => state.toggle)
  const fetch = useRadarStore((state) => state.fetch)

  // Derived from `frames` in the render body (not as a store selector) —
  // a selector returning a freshly-built array every call would never be
  // reference-equal to its previous result, causing an infinite re-render
  // loop through Zustand's `useSyncExternalStore` snapshot comparison.
  const allFrames = frames ? [...frames.past, ...frames.nowcast] : []
  const selectedFrame = allFrames[selectedFrameIndex]
  const isNowcastFrame = frames ? selectedFrameIndex >= frames.past.length : false

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={enabled}
        title="Precipitation radar"
        aria-label="Toggle precipitation radar"
        className={cn(
          'border-surface-600 bg-surface-900/90 hover:bg-surface-800 absolute top-[49.5rem] right-3 z-10 rounded-lg border p-2.5 shadow-lg backdrop-blur-sm transition-colors',
          enabled ? 'bg-brand-500/15 text-brand-400' : 'text-ink-300',
        )}
      >
        <Radar size={18} aria-hidden="true" />
      </button>

      {enabled && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="border-surface-600 bg-surface-900/95 w-full max-w-sm rounded-lg border p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-ink-100 text-sm font-semibold">Precipitation radar</h2>
              <button
                type="button"
                onClick={toggle}
                aria-label="Hide radar"
                className="text-ink-500 hover:text-ink-100"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {status === 'loading' && <p className="text-ink-500 text-sm">Loading radar…</p>}
            {status === 'error' && (
              <p className="text-status-danger text-sm">
                Radar unavailable — {errorReason}.{' '}
                <button type="button" onClick={() => void fetch()} className="underline">
                  Retry
                </button>
              </p>
            )}

            {frames && selectedFrame && (
              <>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-ink-100 text-sm font-medium">
                    {formatFrameLabel(selectedFrame.time, isNowcastFrame)}
                  </span>
                  <span className="text-ink-500 text-xs">
                    {new Date(selectedFrame.time * 1000).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <input
                  type="range"
                  min={0}
                  max={Math.max(0, allFrames.length - 1)}
                  step={1}
                  value={selectedFrameIndex}
                  onChange={(e) => setSelectedFrameIndex(Number(e.target.value))}
                  aria-label="Radar frame"
                  className="accent-brand-500 w-full"
                />
                <div className="text-ink-500 mt-1 flex justify-between text-[10px]">
                  <span>-{Math.max(0, Math.round(Math.abs(minutesFromNow(allFrames[0].time))))} min</span>
                  <span>Now</span>
                  <span>Forecast</span>
                </div>

                <p className="text-ink-500 mt-2 text-[10px]">
                  Real radar data © RainViewer — nowcast frames are their short-range extrapolation,
                  not observed data.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
