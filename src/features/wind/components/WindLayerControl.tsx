import { Cloud, CloudRain, Thermometer, Wind, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'
import { compassLabel } from '@/utils/terrain'
import { LAYER_LEGEND, valueForLayer, weatherLayerGradientCss } from '@/utils/weatherMapColors'
import { useWindStore } from '../state/windStore'
import { WindCompass } from './WindCompass'
import type { Coordinate, WeatherMapLayer } from '@/types'
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

/** Windy-style layer switcher — every layer rides the same already-
 * fetched grid (see `windStore.ts`), so tapping between them is instant,
 * never a new fetch. */
const LAYER_TABS: { value: WeatherMapLayer; label: string; Icon: LucideIcon }[] = [
  { value: 'wind', label: 'Wind', Icon: Wind },
  { value: 'temperature', label: 'Temperature', Icon: Thermometer },
  { value: 'precipitation', label: 'Precipitation', Icon: CloudRain },
  { value: 'clouds', label: 'Clouds', Icon: Cloud },
]

const LAYER_ICON: Record<WeatherMapLayer, LucideIcon> = {
  wind: Wind,
  temperature: Thermometer,
  precipitation: CloudRain,
  clouds: Cloud,
}

function formatLayerValue(layer: WeatherMapLayer, value: number): string {
  switch (layer) {
    case 'wind':
      return `${Math.round(value)} km/h`
    case 'temperature':
      return `${Math.round(value)}°C`
    case 'precipitation':
      return `${value.toFixed(1)} mm/h`
    case 'clouds':
      return `${Math.round(value)}%`
  }
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
  const activeLayer = useWindStore((state) => state.activeLayer)
  const setActiveLayer = useWindStore((state) => state.setActiveLayer)
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
              <h2 className="text-ink-100 text-sm font-semibold">Weather map</h2>
              <button
                type="button"
                onClick={handleToggle}
                aria-label="Hide wind layer"
                className="text-ink-500 hover:text-ink-100"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div role="tablist" aria-label="Weather map layer" className="mb-3 grid grid-cols-4 gap-1">
              {LAYER_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={activeLayer === tab.value}
                  onClick={() => setActiveLayer(tab.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-md px-1 py-1.5 text-center transition-colors',
                    activeLayer === tab.value
                      ? 'bg-brand-500/15 text-brand-400'
                      : 'text-ink-300 hover:bg-surface-800',
                  )}
                >
                  <tab.Icon size={15} aria-hidden="true" />
                  <span className="text-[10px] leading-tight">{tab.label}</span>
                </button>
              ))}
            </div>

            {status === 'loading' && <p className="text-ink-500 text-sm">Loading weather data…</p>}
            {status === 'error' && (
              <p className="text-status-danger text-sm">
                Weather map unavailable — {errorReason}.{' '}
                <button type="button" onClick={refresh} className="underline">
                  Retry
                </button>
              </p>
            )}

            {reading && (
              <>
                {activeLayer === 'wind' ? (
                  <div className="mb-2 flex items-center gap-3">
                    <WindCompass directionDegrees={reading.directionDegrees} speedKmh={reading.speedKmh} />
                    <div>
                      <p className="text-ink-100 text-xl font-bold">
                        {Math.round(reading.speedKmh)} <span className="text-sm font-medium">km/h</span>
                      </p>
                      <p className="text-ink-300 text-sm">from {compassLabel(reading.directionDegrees)}</p>
                      <p className="text-ink-500 mt-1 text-xs">
                        Gusts {Math.round(reading.gustsKmh)} km/h · {formatHourLabel(selectedHourOffset)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mb-2 flex items-center gap-3">
                    {(() => {
                      const LayerIcon = LAYER_ICON[activeLayer]
                      return <LayerIcon size={22} className="text-brand-400 shrink-0" aria-hidden="true" />
                    })()}
                    <div>
                      <p className="text-ink-100 text-sm font-medium">
                        {formatLayerValue(activeLayer, valueForLayer(activeLayer, reading))}
                      </p>
                      <p className="text-ink-500 text-xs">{formatHourLabel(selectedHourOffset)}</p>
                    </div>
                  </div>
                )}

                <div className="mb-2">
                  <div
                    className="h-2 w-full rounded-full"
                    style={{ background: weatherLayerGradientCss(activeLayer) }}
                    aria-hidden="true"
                  />
                  <div className="text-ink-500 mt-0.5 flex justify-between text-[10px]">
                    <span>
                      {LAYER_LEGEND[activeLayer].min}
                      {LAYER_LEGEND[activeLayer].unit}
                    </span>
                    <span>{LAYER_LEGEND[activeLayer].label}</span>
                    <span>
                      {LAYER_LEGEND[activeLayer].max}
                      {LAYER_LEGEND[activeLayer].unit}
                    </span>
                  </div>
                </div>

                <input
                  type="range"
                  min={0}
                  max={47}
                  step={1}
                  value={selectedHourOffset}
                  onChange={(e) => setSelectedHourOffset(Number(e.target.value))}
                  aria-label="Hour offset"
                  className="accent-brand-500 w-full"
                />
                <div className="text-ink-500 mt-1 flex justify-between text-[10px]">
                  <span>Now</span>
                  <span>+24h</span>
                  <span>+47h</span>
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
