import { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  CloudSunRain,
  Layers,
  LineChart,
  ListOrdered,
  Pause,
  Play,
  SlidersHorizontal,
  Wind,
  X,
} from 'lucide-react'
import { ToolTrigger } from '@/components/map-tools'
import { geoMetLegendUrl, layerDef } from '@/services/weather-map'
import { useIsWide } from '@/features/compare/useIsWide'
import { useWindStore } from '@/features/wind/state/windStore'
import { useWindAnalysisStore } from '@/features/wind/state/windAnalysisStore'
import { WindCompass } from '@/features/wind/components/WindCompass'
import { cn } from '@/utils/cn'
import type { Coordinate } from '@/types'
import type { LngLatBounds } from '@/utils/tiles'
import { useWeatherMapStore } from '../state/weatherMapStore'
import { useWindStyleStore } from '../state/windStyleStore'
import { formatFrameClock } from '../formatFrameTime'
import { LAYER_PRESENTATION } from '../layerPresentation'
import { useWeatherMapEffects } from '../useWeatherMapEffects'
import { windSync } from '../windSync'
import { LayerList } from './LayerList'
import { TimelineBar } from './TimelineBar'
import { WindStyleSettings } from './WindStyleSettings'

export interface WeatherMapControlProps {
  getBounds: () => LngLatBounds | null
  isFrameReady: (key: string) => boolean
  viewCenter: Coordinate
}

type Tab = 'layers' | 'settings'

/**
 * Carte météo façon application météo : radar animé (dernières heures,
 * Environnement Canada, 1 km) et prévisions HRDPS 2,5 km heure par heure
 * (précipitations, température, vent, rafales, nuages, pression), avec
 * lecture/pause, ligne du temps, légende officielle et valeur réelle au
 * centre de la carte.
 *
 * Disposition : sur iPhone, un panneau inférieur repliable (état compact :
 * couche, heure, lecture/pause) ; sur grand écran, un panneau latéral pour
 * les couches et réglages et une ligne du temps large au bas de la carte.
 * Deux onglets : « Couches » (le phénomène, le vent superposé) et
 * « Réglages » (opacité, présentation du vent).
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
  const windField = useWindStore((s) => s.field)
  const windHourOffset = useWindStore((s) => s.selectedHourOffset)
  const windReading = useWindStore((s) => (s.field ? s.windAt(viewCenter) : null))

  const windStyle = useWindStyleStore((s) => s.style)
  const updateWindStyle = useWindStyleStore((s) => s.update)

  const analysisOpen = useWindAnalysisStore((s) => s.open)
  const openAnalysis = useWindAnalysisStore((s) => s.openPanel)
  const closeAnalysis = useWindAnalysisStore((s) => s.closePanel)

  const [legendOpen, setLegendOpen] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [tab, setTab] = useState<Tab>('layers')
  const wide = useIsWide()

  useWeatherMapEffects({ isFrameReady, getBounds, viewCenter })

  const def = layerDef(activeLayer)
  const frame = frames[frameIndex]
  const now = new Date()
  const ActiveIcon = LAYER_PRESENTATION[activeLayer].icon
  const sync = windEnabled
    ? windSync(windField, frame?.time ?? null, windHourOffset)
    : null

  function handleToggleWind() {
    const bounds = getBounds()
    if (bounds) toggleWind(bounds)
  }

  /** The analysis panel replaces this one (a single bottom sheet at a time;
   * the radar/forecast layers keep showing). It needs the wind particles
   * and their forecast, so they are switched on if they were off. */
  function handleOpenAnalysis() {
    if (!windEnabled) handleToggleWind()
    openAnalysis()
  }

  /** The rail button: with the analysis open it brings back the layers
   * panel (closing the analysis); otherwise it opens/closes the panel. */
  function handleRail() {
    if (analysisOpen) {
      closeAnalysis()
      if (!enabled) toggle()
      return
    }
    toggle()
  }

  const timeline =
    status === 'available' && frame ? (
      <>
        <TimelineBar
          frames={frames}
          frameIndex={frameIndex}
          playing={playing}
          now={now}
          maxTicks={wide ? 9 : 5}
          onPlayingChange={setPlaying}
          onStep={step}
          onSeek={setFrameIndex}
        />
        <p className="text-ink-300 mt-1 text-xs" aria-live="polite">
          {def.formatValue === null
            ? 'Isobares (hPa)'
            : centerValueStatus === 'loading'
              ? 'Centre : …'
              : centerValue
                ? `Centre : ${centerValue}`
                : def.kind === 'observed'
                  ? 'Centre : aucun écho'
                  : 'Centre : —'}
        </p>
      </>
    ) : null

  const statusLines = (
    <>
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
    </>
  )

  const legend = (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setLegendOpen(!legendOpen)}
        aria-pressed={legendOpen}
        className={cn(
          'flex items-center gap-1 self-start rounded-full border px-2.5 py-1 text-xs pointer-coarse:min-h-11',
          legendOpen
            ? 'border-brand-400 bg-brand-500/20 text-brand-300'
            : 'border-surface-600 text-ink-300',
        )}
      >
        <ListOrdered size={14} aria-hidden="true" />
        Légende
      </button>
      {legendOpen && (
        <div
          className="mx-auto flex w-fit justify-center gap-2 rounded-md bg-white p-1"
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
    </div>
  )

  const windSection = (
    <section className="border-surface-700 flex flex-col gap-2 border-t pt-2">
      <p className="text-ink-500 text-[11px] font-semibold tracking-wide uppercase">
        Vent superposé
      </p>
      <div className="flex flex-wrap gap-2">
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
        <button
          type="button"
          onClick={handleOpenAnalysis}
          className="border-brand-400 bg-brand-500/20 text-brand-300 flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs pointer-coarse:min-h-11"
        >
          <LineChart size={14} aria-hidden="true" />
          Analyse du vent
        </button>
      </div>
      {windEnabled && (
        <div className="flex items-center gap-3">
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
      {sync?.state === 'synced' && (
        <p className="text-ink-500 text-xs" data-testid="wind-sync">
          Vent animé : prévision Open-Meteo de {sync.windHourLabel}, suit la ligne du
          temps.
        </p>
      )}
      {sync?.state === 'out-of-range' && (
        <p className="text-status-warning text-xs" data-testid="wind-sync">
          Le vent animé reste à {sync.windHourLabel} : l’heure de la couche affichée est
          hors de sa période de prévision. Les deux lectures ne correspondent pas.
        </p>
      )}
    </section>
  )

  const tabs = (
    <div role="tablist" aria-label="Carte météo" className="mb-2 grid grid-cols-2 gap-1">
      {(
        [
          ['layers', 'Couches', Layers],
          ['settings', 'Réglages', SlidersHorizontal],
        ] as const
      ).map(([id, label, Icon]) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`wm-tab-${id}`}
          aria-selected={tab === id}
          aria-controls={`wm-panel-${id}`}
          onClick={() => setTab(id)}
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-semibold pointer-coarse:min-h-11',
            tab === id
              ? 'border-brand-400 bg-brand-500/20 text-brand-300'
              : 'border-surface-600 text-ink-300',
          )}
        >
          <Icon size={14} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  )

  const tabBody =
    tab === 'layers' ? (
      <div
        role="tabpanel"
        id="wm-panel-layers"
        aria-labelledby="wm-tab-layers"
        className="flex flex-col gap-3"
      >
        <LayerList active={activeLayer} onSelect={(id) => void setLayer(id)} />
        {legend}
        {windSection}
      </div>
    ) : (
      <div
        role="tabpanel"
        id="wm-panel-settings"
        aria-labelledby="wm-tab-settings"
        className="flex flex-col gap-3"
      >
        <label className="text-ink-300 flex items-center justify-between gap-3 text-xs">
          Opacité de la couche
          <input
            type="range"
            min={10}
            max={100}
            value={Math.round(opacity * 100)}
            onChange={(e) => setOpacity(Number(e.target.value) / 100)}
            aria-label="Opacité de la couche météo"
            className="accent-brand-500 w-40 pointer-coarse:h-11"
          />
        </label>
        <section className="border-surface-700 flex flex-col gap-2 border-t pt-3">
          <p className="text-ink-500 text-[11px] font-semibold tracking-wide uppercase">
            Présentation du vent
          </p>
          {!windEnabled && (
            <p className="text-ink-500 text-xs">
              Le vent animé est désactivé (onglet « Couches »). Les réglages sont gardés
              et s’appliqueront à l’activation.
            </p>
          )}
          <WindStyleSettings
            style={windStyle}
            onChange={(patch) => void updateWindStyle(patch)}
          />
        </section>
      </div>
    )

  const sourceLine = (
    <span className="text-ink-500 text-[10px]">
      {def.kind === 'observed'
        ? 'Radar observé · ECCC 1 km'
        : 'Prévision HRDPS 2,5 km · ECCC'}
    </span>
  )

  const closeButton = (
    <button
      type="button"
      onClick={toggle}
      aria-label="Fermer la carte météo"
      className="text-ink-500 hover:text-ink-100 flex items-center justify-center pointer-coarse:size-11"
    >
      <X size={16} aria-hidden="true" />
    </button>
  )

  return (
    <>
      <ToolTrigger
        placement="rail"
        label="Météo et radar"
        title="Carte météo (radar, vent, pluie…)"
        icon={<CloudSunRain size={20} aria-hidden="true" />}
        onClick={handleRail}
        pressed={enabled}
        active={enabled}
        order={30}
      />

      {enabled && !analysisOpen && wide && (
        <>
          <aside
            data-testid="weather-side-panel"
            aria-label="Carte météo : couches et réglages"
            className="border-surface-600 bg-surface-900/95 fixed top-24 bottom-44 left-[17rem] z-30 flex w-80 flex-col rounded-lg border p-3 shadow-2xl backdrop-blur"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-ink-100 text-sm font-semibold">Carte météo</h2>
              <div className="flex items-center gap-2">
                {sourceLine}
                {closeButton}
              </div>
            </div>
            {statusLines}
            {tabs}
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">{tabBody}</div>
          </aside>
          {timeline && (
            <div
              data-testid="weather-bottom-timeline"
              className="border-surface-600 bg-surface-900/95 fixed right-20 bottom-3 left-[17rem] z-30 rounded-lg border p-3 shadow-2xl backdrop-blur"
            >
              {timeline}
            </div>
          )}
        </>
      )}

      {enabled && !analysisOpen && !wide && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div
            data-testid="weather-bottom-panel"
            className="border-surface-600 bg-surface-900/95 w-full max-w-md rounded-lg border p-3 shadow-2xl backdrop-blur"
          >
            <div className="flex items-center justify-between gap-2">
              {expanded ? (
                <h2 className="text-ink-100 text-sm font-semibold">Carte météo</h2>
              ) : (
                <p
                  className="text-ink-100 flex min-w-0 items-center gap-2 text-sm font-semibold"
                  data-testid="weather-compact"
                >
                  <ActiveIcon
                    size={18}
                    aria-hidden="true"
                    className="text-brand-300 shrink-0"
                  />
                  <span className="truncate">
                    {def.label}
                    {frame && status === 'available' && (
                      <span className="text-ink-300 font-normal tabular-nums">
                        {' · '}
                        {formatFrameClock(frame, now)} ·{' '}
                        {frame.kind === 'observed' ? 'observé' : 'prévu'}
                      </span>
                    )}
                  </span>
                </p>
              )}
              <div className="flex shrink-0 items-center gap-1">
                {expanded && sourceLine}
                {!expanded && status === 'available' && frame && (
                  <button
                    type="button"
                    onClick={() => setPlaying(!playing)}
                    aria-label={playing ? 'Pause' : 'Lecture'}
                    className="bg-brand-500 text-surface-950 flex size-9 items-center justify-center rounded-full pointer-coarse:size-11"
                  >
                    {playing ? (
                      <Pause size={18} aria-hidden="true" />
                    ) : (
                      <Play size={18} aria-hidden="true" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  aria-expanded={expanded}
                  aria-label={expanded ? 'Réduire le panneau' : 'Déplier le panneau'}
                  className="text-ink-300 hover:text-ink-100 flex size-9 items-center justify-center pointer-coarse:size-11"
                >
                  {expanded ? (
                    <ChevronDown size={18} aria-hidden="true" />
                  ) : (
                    <ChevronUp size={18} aria-hidden="true" />
                  )}
                </button>
                {closeButton}
              </div>
            </div>

            {expanded && (
              <>
                <div className="mt-2">{statusLines}</div>
                {timeline && <div className="mb-2">{timeline}</div>}
                {tabs}
                <div className="max-h-[30vh] overflow-y-auto pr-1">{tabBody}</div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
