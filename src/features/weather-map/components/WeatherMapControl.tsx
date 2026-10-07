import { useState } from 'react'
import {
  CloudSunRain,
  ListOrdered,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Wind,
  X,
} from 'lucide-react'
import { ToolTrigger } from '@/components/map-tools'
import { GEOMET_LAYERS, geoMetLegendUrl, layerDef } from '@/services/weather-map'
import { useWindStore } from '@/features/wind/state/windStore'
import { WindCompass } from '@/features/wind/components/WindCompass'
import { cn } from '@/utils/cn'
import type { Coordinate } from '@/types'
import type { LngLatBounds } from '@/utils/tiles'
import { useWeatherMapStore } from '../state/weatherMapStore'
import { formatFrameClock, formatFrameRelative } from '../formatFrameTime'
import { useWeatherMapEffects } from '../useWeatherMapEffects'

export interface WeatherMapControlProps {
  getBounds: () => LngLatBounds | null
  isFrameReady: (key: string) => boolean
  viewCenter: Coordinate
}

/**
 * Carte météo façon application météo : radar animé (3 dernières
 * heures, Environnement Canada, 1 km) et prévisions HRDPS 2,5 km heure
 * par heure (précipitations, température, vent, rafales, nuages,
 * pression), avec lecture/pause, ligne du temps, légende officielle et
 * valeur réelle au centre de la carte. Remplace les anciens contrôles
 * « vent » et « radar » séparés.
 */
export function WeatherMapControl({
  getBounds,
  isFrameReady,
  viewCenter,
}: WeatherMapControlProps) {
  const enabled = useWeatherMapStore((s) => s.enabled)
  const toggle = useWeatherMapStore((s) => s.toggle)
  const activeLayer = useWeatherMapStore((s) => s.activeLayer)
  const setLayer = useWeatherMapStore((s) => s.setLayer)
  const status = useWeatherMapStore((s) => s.status)
  const errorReason = useWeatherMapStore((s) => s.errorReason)
  const frames = useWeatherMapStore((s) => s.frames)
  const frameIndex = useWeatherMapStore((s) => s.frameIndex)
  const setFrameIndex = useWeatherMapStore((s) => s.setFrameIndex)
  const step = useWeatherMapStore((s) => s.step)
  const playing = useWeatherMapStore((s) => s.playing)
  const setPlaying = useWeatherMapStore((s) => s.setPlaying)
  const opacity = useWeatherMapStore((s) => s.opacity)
  const setOpacity = useWeatherMapStore((s) => s.setOpacity)
  const centerValue = useWeatherMapStore((s) => s.centerValue)
  const centerValueStatus = useWeatherMapStore((s) => s.centerValueStatus)
  const loadFrames = useWeatherMapStore((s) => s.loadFrames)

  const windEnabled = useWindStore((s) => s.enabled)
  const windStatus = useWindStore((s) => s.status)
  const toggleWind = useWindStore((s) => s.toggle)
  const windPaused = useWindStore((s) => s.animationPaused)
  const setWindPaused = useWindStore((s) => s.setAnimationPaused)
  const windReading = useWindStore((s) => (s.field ? s.windAt(viewCenter) : null))

  const [legendOpen, setLegendOpen] = useState(false)

  useWeatherMapEffects({ isFrameReady, getBounds, viewCenter })

  const def = layerDef(activeLayer)
  const frame = frames[frameIndex]
  const now = new Date()

  function handleToggleWind() {
    const bounds = getBounds()
    if (bounds) toggleWind(bounds)
  }

  return (
    <>
      <ToolTrigger
        placement="rail"
        label="Météo et radar"
        title="Carte météo (radar, vent, pluie…)"
        icon={<CloudSunRain size={20} aria-hidden="true" />}
        onClick={toggle}
        pressed={enabled}
        active={enabled}
        order={30}
      />

      {enabled && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="border-surface-600 bg-surface-900/95 w-full max-w-md rounded-lg border p-3 shadow-2xl backdrop-blur">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-ink-100 text-sm font-semibold">Carte météo</h2>
              <div className="flex items-center gap-2">
                <span className="text-ink-500 text-[10px]">
                  {def.kind === 'observed'
                    ? 'Radar observé · ECCC 1 km'
                    : 'Prévision HRDPS 2,5 km · ECCC'}
                </span>
                <button
                  type="button"
                  onClick={toggle}
                  aria-label="Fermer la carte météo"
                  className="text-ink-500 hover:text-ink-100 flex items-center justify-center pointer-coarse:size-11"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div
              className="-mx-1 mb-2 flex gap-1 overflow-x-auto px-1 pb-1"
              role="radiogroup"
              aria-label="Couche météo"
            >
              {GEOMET_LAYERS.map((layer) => (
                <button
                  key={layer.id}
                  type="button"
                  role="radio"
                  aria-checked={layer.id === activeLayer}
                  onClick={() => void setLayer(layer.id)}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors pointer-coarse:min-h-11',
                    layer.id === activeLayer
                      ? 'border-brand-400 bg-brand-500/20 text-brand-300'
                      : 'border-surface-600 text-ink-300 hover:bg-surface-800',
                  )}
                >
                  {layer.label}
                </button>
              ))}
            </div>

            {status === 'loading' && (
              <p className="text-ink-500 text-sm">Chargement des images…</p>
            )}
            {status === 'error' && (
              <p className="text-status-danger text-sm">
                Couche indisponible — {errorReason}.{' '}
                <button
                  type="button"
                  onClick={() => void loadFrames(true)}
                  className="underline"
                >
                  Réessayer
                </button>
              </p>
            )}

            {status === 'available' && frame && (
              <>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <p className="text-ink-100 text-sm font-semibold tabular-nums">
                    {formatFrameClock(frame, now)}{' '}
                    <span className="text-ink-500 text-xs font-normal">
                      · {frame.kind === 'observed' ? 'observé' : 'prévu'},{' '}
                      {formatFrameRelative(frame, now)}
                    </span>
                  </p>
                  <p className="text-ink-300 text-xs" aria-live="polite">
                    {def.formatValue === null
                      ? 'Isobares (hPa)'
                      : centerValueStatus === 'loading'
                        ? '…'
                        : centerValue
                          ? `Centre : ${centerValue}`
                          : def.kind === 'observed'
                            ? 'Centre : aucun écho'
                            : 'Centre : —'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    aria-label="Image précédente"
                    className="text-ink-300 hover:text-ink-100 flex items-center justify-center p-1 pointer-coarse:size-11"
                  >
                    <SkipBack size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlaying(!playing)}
                    className="bg-brand-500 text-surface-950 hover:bg-brand-400 flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold pointer-coarse:min-h-11"
                  >
                    {playing ? (
                      <Pause size={16} aria-hidden="true" />
                    ) : (
                      <Play size={16} aria-hidden="true" />
                    )}
                    {playing ? 'Pause' : 'Lecture'}
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    aria-label="Image suivante"
                    className="text-ink-300 hover:text-ink-100 flex items-center justify-center p-1 pointer-coarse:size-11"
                  >
                    <SkipForward size={16} aria-hidden="true" />
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, frames.length - 1)}
                    value={frameIndex}
                    onChange={(e) => {
                      setPlaying(false)
                      setFrameIndex(Number(e.target.value))
                    }}
                    aria-label="Ligne du temps"
                    className="accent-brand-500 flex-1"
                  />
                </div>
                <div className="text-ink-500 mt-0.5 flex justify-between px-1 text-[10px]">
                  <span>{formatFrameClock(frames[0], now)}</span>
                  <span>{formatFrameClock(frames[frames.length - 1], now)}</span>
                </div>
              </>
            )}

            <div className="border-surface-700 mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
              <label className="text-ink-500 flex items-center gap-2 text-xs">
                Opacité
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={Math.round(opacity * 100)}
                  onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                  aria-label="Opacité de la couche météo"
                  className="accent-brand-500 w-24"
                />
              </label>
              <button
                type="button"
                onClick={() => setLegendOpen(!legendOpen)}
                aria-pressed={legendOpen}
                className={cn(
                  'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs pointer-coarse:min-h-11',
                  legendOpen
                    ? 'border-brand-400 bg-brand-500/20 text-brand-300'
                    : 'border-surface-600 text-ink-300',
                )}
              >
                <ListOrdered size={14} aria-hidden="true" />
                Légende
              </button>
              <button
                type="button"
                onClick={handleToggleWind}
                aria-pressed={windEnabled}
                className={cn(
                  'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs pointer-coarse:min-h-11',
                  windEnabled
                    ? 'border-brand-400 bg-brand-500/20 text-brand-300'
                    : 'border-surface-600 text-ink-300',
                )}
              >
                <Wind size={14} aria-hidden="true" />
                Particules de vent
              </button>
            </div>

            {legendOpen && (
              <div
                className="mx-auto mt-2 flex w-fit justify-center gap-2 rounded-md bg-white p-1"
                aria-label="Légende"
              >
                {def.wmsLayers.map((layer, i) => (
                  <img
                    key={layer}
                    src={geoMetLegendUrl(def, i)}
                    alt={`Légende ${def.label}`}
                    className="h-32 w-auto"
                  />
                ))}
              </div>
            )}

            {windEnabled && (
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setWindPaused(!windPaused)}
                  className="border-surface-600 text-ink-300 flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs pointer-coarse:min-h-11"
                >
                  {windPaused ? (
                    <Play size={14} aria-hidden="true" />
                  ) : (
                    <Pause size={14} aria-hidden="true" />
                  )}
                  {windPaused ? 'Lecture du vent' : 'Pause du vent'}
                </button>
                {windStatus === 'loading' && (
                  <p className="text-ink-500 text-xs">Chargement du vent…</p>
                )}
                {windStatus === 'error' && (
                  <p className="text-status-danger text-xs">Vent indisponible.</p>
                )}
                {windReading && (
                  <>
                    <WindCompass
                      directionDegrees={windReading.directionDegrees}
                      speedKmh={windReading.speedKmh}
                    />
                    <p className="text-ink-300 text-xs">
                      {Math.round(windReading.speedKmh)} km/h, rafales{' '}
                      {Math.round(windReading.gustsKmh)} km/h
                      <span className="text-ink-500 block">
                        Open-Meteo, point de grille le plus proche
                      </span>
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
